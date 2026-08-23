import {
  IdempotencyInProgressError,
  IdempotencyKeyConflictError,
} from '../common/errors/domain.errors';
import type { Prisma } from '../generated/prisma/client';
import {
  IdempotencyService,
  type IdempotencyParams,
} from './idempotency.service';

const PARAMS: IdempotencyParams = {
  scope: 'payLink',
  key: 'key-1',
  requestHash: 'hash-1',
};

interface TxMock {
  $queryRaw: jest.Mock;
  idempotencyKey: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
}

function makeTx(): TxMock {
  return {
    $queryRaw: jest.fn(),
    idempotencyKey: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

function asTx(tx: TxMock): Prisma.TransactionClient {
  return tx as unknown as Prisma.TransactionClient;
}

describe('IdempotencyService', () => {
  let service: IdempotencyService;

  beforeEach(() => {
    service = new IdempotencyService();
  });

  it('runs the work once and stores its response on first use', async () => {
    const tx = makeTx();
    tx.$queryRaw.mockResolvedValue([{ id: 'row-1' }]);
    const work = jest.fn(() => Promise.resolve({ paymentId: 'p1' }));

    const result = await service.execute(asTx(tx), PARAMS, work);

    expect(result).toEqual({ paymentId: 'p1' });
    expect(work).toHaveBeenCalledTimes(1);
    expect(tx.idempotencyKey.update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: { status: 'COMPLETED', responseBody: { paymentId: 'p1' } },
    });
  });

  it('replays the stored response and skips the work on a duplicate', async () => {
    const tx = makeTx();
    tx.$queryRaw.mockResolvedValue([]);
    tx.idempotencyKey.findUnique.mockResolvedValue({
      requestHash: 'hash-1',
      status: 'COMPLETED',
      responseBody: { paymentId: 'p1' },
    });
    const work = jest.fn(() => Promise.resolve({ paymentId: 'p1' }));

    const result = await service.execute(asTx(tx), PARAMS, work);

    expect(result).toEqual({ paymentId: 'p1' });
    expect(work).not.toHaveBeenCalled();
  });

  it('rejects a key reused with a different request', async () => {
    const tx = makeTx();
    tx.$queryRaw.mockResolvedValue([]);
    tx.idempotencyKey.findUnique.mockResolvedValue({
      requestHash: 'DIFFERENT',
      status: 'COMPLETED',
      responseBody: { paymentId: 'p1' },
    });
    const work = jest.fn(() => Promise.resolve({ paymentId: 'p1' }));

    await expect(
      service.execute(asTx(tx), PARAMS, work),
    ).rejects.toBeInstanceOf(IdempotencyKeyConflictError);
    expect(work).not.toHaveBeenCalled();
  });

  it('rejects when a matching key is still in progress', async () => {
    const tx = makeTx();
    tx.$queryRaw.mockResolvedValue([]);
    tx.idempotencyKey.findUnique.mockResolvedValue({
      requestHash: 'hash-1',
      status: 'IN_PROGRESS',
      responseBody: null,
    });
    const work = jest.fn(() => Promise.resolve({ paymentId: 'p1' }));

    await expect(
      service.execute(asTx(tx), PARAMS, work),
    ).rejects.toBeInstanceOf(IdempotencyInProgressError);
  });
});
