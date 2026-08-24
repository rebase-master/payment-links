import {
  PaymentLinkNotFoundError,
  PaymentLinkNotPayableError,
  PlatformAccountNotConfiguredError,
  UnsupportedCurrencyError,
} from '../common/errors/domain.errors';
import type { PrismaService } from '../database/prisma.service';
import type { Merchant } from '../generated/prisma/client';
import type { IdempotencyService } from '../idempotency/idempotency.service';
import { PaymentsService } from './payments.service';

interface TxMock {
  $executeRaw: jest.Mock;
  paymentLink: {
    findUnique: jest.Mock;
    updateMany: jest.Mock;
    create: jest.Mock;
  };
  payment: { create: jest.Mock };
  account: { findFirst: jest.Mock; findFirstOrThrow: jest.Mock };
  ledgerEntry: { createMany: jest.Mock };
}

function makeTx(): TxMock {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    paymentLink: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({
        id: 'link-new',
        amount: 5000n,
        currency: 'AED',
        status: 'ACTIVE',
        description: null,
        reference: null,
        expiresAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    },
    payment: {
      create: jest.fn().mockResolvedValue({ id: 'pay-1', status: 'SUCCEEDED' }),
    },
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-clearing' }),
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'acc-balance' }),
    },
    ledgerEntry: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
  };
}

function makeService(tx: TxMock): {
  service: PaymentsService;
  outbox: { write: jest.Mock };
} {
  const prisma = {
    $transaction: (cb: (t: unknown) => unknown) => cb(tx),
  } as unknown as PrismaService;
  const idempotency = {
    execute: (_tx: unknown, _params: unknown, work: () => unknown) => work(),
  } as unknown as IdempotencyService;
  const outbox = { write: jest.fn().mockResolvedValue(undefined) };
  const service = new PaymentsService(prisma, idempotency, outbox);
  return { service, outbox };
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
      id: 'pay-1',
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
    const { service } = makeService(tx);
    const merchant = { id: 'merchant-1' } as unknown as Merchant;

    await service.createPaymentLink(merchant, {
      amount: 5000n,
      currency: 'AED',
      idempotencyKey: 'create-1',
    });

    expect(tx.paymentLink.create).toHaveBeenCalledWith({
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

  it('rejects a currency with no clearing account', async () => {
    const tx = makeTx();
    tx.account.findFirst.mockResolvedValue(null);
    const { service } = makeService(tx);
    const merchant = { id: 'merchant-1' } as unknown as Merchant;

    await expect(
      service.createPaymentLink(merchant, {
        amount: 5000n,
        currency: 'USD',
        idempotencyKey: 'create-2',
      }),
    ).rejects.toBeInstanceOf(UnsupportedCurrencyError);
    expect(tx.paymentLink.create).not.toHaveBeenCalled();
  });
});
