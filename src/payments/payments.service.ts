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

const PROVIDER = 'mock_psp';

export interface CreatePaymentLinkInput {
  amount: bigint;
  currency: string;
  description?: string | null;
  reference?: string | null;
  expiresAt?: Date | null;
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

  async createPaymentLink(
    merchant: Merchant,
    input: CreatePaymentLinkInput,
  ): Promise<PaymentLinkResult> {
    // merchantId comes from the authenticated merchant, never the input.
    const link = await this.prisma.paymentLink.create({
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
  }

  payLink(input: PayLinkInput): Promise<PaymentResult> {
    const requestHash = createHash('sha256')
      .update(input.paymentLinkId)
      .digest('hex');

    return this.prisma.$transaction((tx) =>
      this.idempotency.execute<PaymentResult>(
        tx,
        { scope: 'payLink', key: input.idempotencyKey, requestHash },
        () => this.settle(tx, input.paymentLinkId),
      ),
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
