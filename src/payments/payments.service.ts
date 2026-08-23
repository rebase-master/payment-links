import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  PaymentLinkNotFoundError,
  PaymentLinkNotPayableError,
  PlatformAccountNotConfiguredError,
} from '../common/errors/domain.errors';
import { PrismaService } from '../database/prisma.service';
import type { Merchant, PaymentLink, Prisma } from '../generated/prisma/client';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { OutboxService } from '../outbox/outbox.service';

// Stand-in payment provider: payLink settles synchronously here with no real
// money movement, and as a public mutation it has no rate limiting yet. The
// webhook phase replaces this with a signature-verified provider callback.
const PROVIDER = 'mock_psp';

// Concurrent same-key requests block on the idempotency INSERT until the first
// commits; allow room beyond Prisma's 5s default so contention surfaces as a
// wait rather than a "Transaction already closed".
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
  paymentId: string;
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
    merchant: Merchant,
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

    // Key namespaced by merchant so two merchants cannot collide on a shared
    // value; a retry with the same key + input replays the same link.
    return this.prisma.$transaction(
      (tx) =>
        this.idempotency.execute<PaymentLinkResult>(
          tx,
          {
            scope: 'createPaymentLink',
            key: `${merchant.id}:${input.idempotencyKey}`,
            requestHash,
          },
          async () => {
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
    const requestHash = createHash('sha256')
      .update(input.paymentLinkId)
      .digest('hex');

    // Key namespaced by link id: reusing a key on a different link is a
    // different claim, so a shared value cannot be "burned" across links.
    return this.prisma.$transaction(
      (tx) =>
        this.idempotency.execute<PaymentResult>(
          tx,
          {
            scope: 'payLink',
            key: `${input.paymentLinkId}:${input.idempotencyKey}`,
            requestHash,
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

    // Atomic ACTIVE -> PAID: the row's own guard against a concurrent,
    // different-key payment of the same link. Idempotency dedupes same-key
    // retries; this stops double payment across distinct keys.
    const flipped = await tx.paymentLink.updateMany({
      where: { id: paymentLinkId, status: 'ACTIVE' },
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

    // A merchant gets a balance account per currency on first payment; the
    // platform clearing account is seeded infra and must already exist.
    const merchantBalance = await tx.account.upsert({
      where: {
        merchantId_type_currency: {
          merchantId: link.merchantId,
          type: 'MERCHANT_BALANCE',
          currency: link.currency,
        },
      },
      create: {
        merchantId: link.merchantId,
        type: 'MERCHANT_BALANCE',
        currency: link.currency,
      },
      update: {},
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
      paymentId: payment.id,
      paymentLinkId,
      status: payment.status,
      amount: link.amount.toString(),
      currency: link.currency,
    };
  }
}

function toPaymentLinkResult(link: PaymentLink): PaymentLinkResult {
  return {
    id: link.id,
    amount: link.amount.toString(),
    currency: link.currency,
    status: link.status,
    description: link.description,
    reference: link.reference,
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
    createdAt: link.createdAt.toISOString(),
  };
}
