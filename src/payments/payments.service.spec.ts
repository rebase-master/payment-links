import {
  PaymentLinkNotFoundError,
  PaymentLinkNotPayableError,
  PlatformAccountNotConfiguredError,
} from '../common/errors/domain.errors';
import type { PrismaService } from '../database/prisma.service';
import type { Merchant } from '../generated/prisma/client';
import type { IdempotencyService } from '../idempotency/idempotency.service';
import { PaymentsService } from './payments.service';

interface TxMock {
  paymentLink: { findUnique: jest.Mock; updateMany: jest.Mock };
  payment: { create: jest.Mock };
  account: { upsert: jest.Mock; findFirst: jest.Mock };
  ledgerEntry: { createMany: jest.Mock };
}

function makeTx(): TxMock {
  return {
    paymentLink: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    payment: {
      create: jest.fn().mockResolvedValue({ id: 'pay-1', status: 'SUCCEEDED' }),
    },
    account: {
      upsert: jest.fn().mockResolvedValue({ id: 'acc-balance' }),
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-clearing' }),
    },
    ledgerEntry: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
  };
}

function makeService(tx: TxMock): {
  service: PaymentsService;
  outbox: { write: jest.Mock };
  createLink: jest.Mock;
} {
  const createLink = jest.fn().mockResolvedValue({
    id: 'link-new',
    amount: 5000n,
    currency: 'AED',
    status: 'ACTIVE',
    description: null,
    reference: null,
    expiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  const prisma = {
    $transaction: (cb: (t: unknown) => unknown) => cb(tx),
    paymentLink: { create: createLink },
  } as unknown as PrismaService;
  const idempotency = {
    execute: (_tx: unknown, _params: unknown, work: () => unknown) => work(),
  } as unknown as IdempotencyService;
  const outbox = { write: jest.fn().mockResolvedValue(undefined) };
  const service = new PaymentsService(prisma, idempotency, outbox);
  return { service, outbox, createLink };
}

const ACTIVE_LINK = {
  id: 'link-1',
  merchantId: 'merchant-1',
  amount: 2500n,
  currency: 'AED',
  status: 'ACTIVE',
  expiresAt: null,
};

describe('PaymentsService.payLink', () => {
  it('posts balanced ledger entries, flips the link to PAID, and writes an outbox event', async () => {
    const tx = makeTx();
    tx.paymentLink.findUnique.mockResolvedValue(ACTIVE_LINK);
    const { service, outbox } = makeService(tx);

    const result = await service.payLink({
      paymentLinkId: 'link-1',
      idempotencyKey: 'idem-1',
    });

    expect(tx.paymentLink.updateMany).toHaveBeenCalledWith({
      where: { id: 'link-1', status: 'ACTIVE' },
      data: { status: 'PAID' },
    });

    expect(tx.ledgerEntry.createMany).toHaveBeenCalledWith({
      data: [
        {
          accountId: 'acc-clearing',
          paymentId: 'pay-1',
          direction: 'DEBIT',
          amount: 2500n,
          currency: 'AED',
        },
        {
          accountId: 'acc-balance',
          paymentId: 'pay-1',
          direction: 'CREDIT',
          amount: 2500n,
          currency: 'AED',
        },
      ],
    });

    expect(outbox.write).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      paymentId: 'pay-1',
      paymentLinkId: 'link-1',
      status: 'SUCCEEDED',
      amount: '2500',
      currency: 'AED',
    });
  });

  it('rejects an unknown link', async () => {
    const tx = makeTx();
    tx.paymentLink.findUnique.mockResolvedValue(null);
    const { service } = makeService(tx);

    await expect(
      service.payLink({ paymentLinkId: 'nope', idempotencyKey: 'k' }),
    ).rejects.toBeInstanceOf(PaymentLinkNotFoundError);
  });

  it('rejects a link that is not ACTIVE', async () => {
    const tx = makeTx();
    tx.paymentLink.findUnique.mockResolvedValue({
      ...ACTIVE_LINK,
      status: 'PAID',
    });
    const { service } = makeService(tx);

    await expect(
      service.payLink({ paymentLinkId: 'link-1', idempotencyKey: 'k' }),
    ).rejects.toBeInstanceOf(PaymentLinkNotPayableError);
  });

  it('rejects when a concurrent payment already flipped the link', async () => {
    const tx = makeTx();
    tx.paymentLink.findUnique.mockResolvedValue(ACTIVE_LINK);
    tx.paymentLink.updateMany.mockResolvedValue({ count: 0 });
    const { service } = makeService(tx);

    await expect(
      service.payLink({ paymentLinkId: 'link-1', idempotencyKey: 'k' }),
    ).rejects.toBeInstanceOf(PaymentLinkNotPayableError);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('rejects when the platform clearing account is missing', async () => {
    const tx = makeTx();
    tx.paymentLink.findUnique.mockResolvedValue(ACTIVE_LINK);
    tx.account.findFirst.mockResolvedValue(null);
    const { service } = makeService(tx);

    await expect(
      service.payLink({ paymentLinkId: 'link-1', idempotencyKey: 'k' }),
    ).rejects.toBeInstanceOf(PlatformAccountNotConfiguredError);
  });
});

describe('PaymentsService.createPaymentLink', () => {
  it('creates the link for the authenticated merchant, not a client-supplied id', async () => {
    const tx = makeTx();
    const { service, createLink } = makeService(tx);
    const merchant = { id: 'merchant-1' } as unknown as Merchant;

    await service.createPaymentLink(merchant, {
      amount: 5000n,
      currency: 'AED',
    });

    expect(createLink).toHaveBeenCalledWith({
      data: {
        merchantId: 'merchant-1',
        amount: 5000n,
        currency: 'AED',
        description: null,
        reference: null,
        expiresAt: null,
      },
    });
  });
});
