import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  PaymentLinkNotFoundError,
  PaymentLinkNotPayableError,
  PlatformAccountNotConfiguredError,
  UnsupportedCurrencyError,
} from '../common/errors/domain.errors';
import { PrismaService } from '../database/prisma.service';
import type { PaymentLink, Prisma } from '../generated/prisma/client';
import type { MerchantPrincipal } from '../auth/merchant-principal';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { OutboxService } from '../outbox/outbox.service';

// Stand-in payment provider: payLink settles synchronously here with no real
// money movement, and as a public mutation it has no rate limiting yet. The
// webhook phase replaces this with a signature-verified provider callback.
const PROVIDER = 'mock_psp';

// Timeout bounds on the money path, innermost first:
// - lock_timeout 2s (set by IdempotencyService before the claim): a same-key
//   request waiting on an uncommitted first attempt gives up here (55P03).
// - statement_timeout 5s / query_timeout 7s (PrismaService): cap any single
//   statement, server-side first.
// - timeout 15s below: caps the whole interactive transaction.
// So same-key contention fails after ~2s, never by waiting out the
// transaction. That 55P03 is not yet mapped to IDEMPOTENCY_IN_PROGRESS, so
// for now it still surfaces as a masked 500.
const TX_OPTIONS = {
  isolationLevel: 'ReadCommitted',
  timeout: 15_000,
  maxWait: 10_000,
} as const;

export interface CreatePaymentLinkInput {
  amount: bigint;
  currency: string;
  description?: string | null;
  reference?: string | null;
  expiresAt?: Date | null;
  idempotencyKey: string;
}

export interface PayLinkInput {
  paymentLinkId: string;
  idempotencyKey: string;
}

export type PaymentLinkResult = {
  id: string;
  amount: string;
  currency: string;
  status: string;
  description: string | null;
  reference: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type PaymentResult = {
  id: string;
  paymentLinkId: string;
  status: string;
  amount: string;
  currency: string;
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly outbox: OutboxService,
  ) {}

  createPaymentLink(
    merchant: MerchantPrincipal,
    input: CreatePaymentLinkInput,
  ): Promise<PaymentLinkResult> {
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          amount: input.amount.toString(),
          currency: input.currency,
          description: input.description ?? null,
          reference: input.reference ?? null,
          expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
        }),
      )
      .digest('hex');

    //  Idempotency is scoped per merchant via ownerId so two merchants cannot collide on a shared
    // value; a retry with the same key + input replays the same link.
    return this.prisma.$transaction(
      (tx) =>
        this.idempotency.execute<PaymentLinkResult>(
          tx,
          {
            scope: 'createPaymentLink',
            ownerId: merchant.id,
            key: input.idempotencyKey,
            requestHash,
          },
          async () => {
            // A link can only be created in a currency the platform settles
            // (one with a clearing account); otherwise paying it would later
            // fail with an internal error. Reject at creation instead.
            const clearing = await tx.account.findFirst({
              where: {
                merchantId: null,
                type: 'PLATFORM_CLEARING',
                currency: input.currency,
              },
            });
            if (!clearing) {
              throw new UnsupportedCurrencyError(input.currency);
            }

            // merchantId comes from the authenticated merchant, never input.
            const link = await tx.paymentLink.create({
              data: {
                merchantId: merchant.id,
                amount: input.amount,
                currency: input.currency,
                description: input.description ?? null,
                reference: input.reference ?? null,
                expiresAt: input.expiresAt ?? null,
              },
            });
            return toPaymentLinkResult(link);
          },
        ),
      TX_OPTIONS,
    );
  }

  async getPaymentLink(id: string): Promise<PaymentLinkResult | null> {
    const link = await this.prisma.paymentLink.findUnique({ where: { id } });
    return link ? toPaymentLinkResult(link) : null;
  }

  payLink(input: PayLinkInput): Promise<PaymentResult> {
    // No requestHash: the key already embeds the link id and is unique per
    // (link, client key), so there is no separate request body to compare.
    return this.prisma.$transaction(
      (tx) =>
        this.idempotency.execute<PaymentResult>(
          tx,
          {
            scope: 'payLink',
            ownerId: input.paymentLinkId,
            key: input.idempotencyKey,
          },
          () => this.settle(tx, input.paymentLinkId),
        ),
      TX_OPTIONS,
    );
  }

  private async settle(
    tx: Prisma.TransactionClient,
    paymentLinkId: string,
  ): Promise<PaymentResult> {
    const link = await tx.paymentLink.findUnique({
      where: { id: paymentLinkId },
    });
    if (!link) {
      throw new PaymentLinkNotFoundError(paymentLinkId);
    }
    if (link.status !== 'ACTIVE') {
      throw new PaymentLinkNotPayableError(
        paymentLinkId,
        `status is ${link.status}`,
      );
    }
    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
      throw new PaymentLinkNotPayableError(paymentLinkId, 'link has expired');
    }

    // Atomic ACTIVE -> PAID, gated on not-yet-expired: the row's own guard
    // against a concurrent different-key payment of the same link, and
    // against paying past expiry, enforced by the WHERE clause itself rather
    // than the JS check above it.
    // Idempotency dedupes same-key
    // retries; this stops double payment across distinct keys.
    const flipped = await tx.paymentLink.updateMany({
      where: {
        id: paymentLinkId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      data: { status: 'PAID' },
    });

    if (flipped.count === 0) {
      throw new PaymentLinkNotPayableError(
        paymentLinkId,
        'link is no longer active',
      );
    }

    const payment = await tx.payment.create({
      data: {
        paymentLinkId,
        amount: link.amount,
        currency: link.currency,
        status: 'SUCCEEDED',
        provider: PROVIDER,
        providerPaymentId: `${PROVIDER}_${randomUUID()}`,
      },
    });

    // Atomic get-or-create for the merchant's balance account: ON CONFLICT DO
    // NOTHING then re-select, like the idempotency claim. upsert is not atomic
    // here — a concurrent first payment can lose a P2002 race and abort the
    // whole transaction.
    await tx.$executeRaw`
      INSERT INTO "accounts" ("id", "merchant_id", "type", "currency")
      VALUES (gen_random_uuid(), ${link.merchantId}::uuid, 'MERCHANT_BALANCE'::"AccountType", ${link.currency})
      ON CONFLICT ("merchant_id", "type", "currency") DO NOTHING
    `;
    const merchantBalance = await tx.account.findFirstOrThrow({
      where: {
        merchantId: link.merchantId,
        type: 'MERCHANT_BALANCE',
        currency: link.currency,
      },
    });

    const clearing = await tx.account.findFirst({
      where: {
        merchantId: null,
        type: 'PLATFORM_CLEARING',
        currency: link.currency,
      },
    });
    if (!clearing) {
      throw new PlatformAccountNotConfiguredError(link.currency);
    }

    // Balanced double entry: the platform receives the funds (debit clearing),
    // the merchant is now owed them (credit their balance). debits == credits.
    await tx.ledgerEntry.createMany({
      data: [
        {
          accountId: clearing.id,
          paymentId: payment.id,
          direction: 'DEBIT',
          amount: link.amount,
          currency: link.currency,
        },
        {
          accountId: merchantBalance.id,
          paymentId: payment.id,
          direction: 'CREDIT',
          amount: link.amount,
          currency: link.currency,
        },
      ],
    });

    await this.outbox.write(tx, {
      aggregateType: 'payment',
      aggregateId: payment.id,
      eventType: 'payment.succeeded',
      payload: {
        paymentId: payment.id,
        paymentLinkId,
        merchantId: link.merchantId,
        amount: link.amount.toString(),
        currency: link.currency,
      },
    });

    return {
      id: payment.id,
      paymentLinkId,
      status: payment.status,
      amount: link.amount.toString(),
      currency: link.currency,
    };
  }
}

function isExpired(link: PaymentLink): boolean {
  return (
    link.status == 'ACTIVE' &&
    link.expiresAt !== null &&
    link.expiresAt.getTime() <= Date.now()
  );
}

function toPaymentLinkResult(link: PaymentLink): PaymentLinkResult {
  return {
    id: link.id,
    amount: link.amount.toString(),
    currency: link.currency,
    status: isExpired(link) ? 'EXPIRED' : link.status,
    description: link.description,
    reference: link.reference,
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
    createdAt: link.createdAt.toISOString(),
  };
}
