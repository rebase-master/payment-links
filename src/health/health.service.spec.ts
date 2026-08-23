import { Logger } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import { HealthService } from './health.service';

function serviceWith(query: () => Promise<unknown>): HealthService {
  const prisma = {
    $queryRaw: jest.fn(query),
  } as unknown as PrismaService;
  return new HealthService(prisma);
}

describe('HealthService', () => {
  it('pingDatabase returns true when the query succeeds', async () => {
    const service = serviceWith(() => Promise.resolve([{ result: 1 }]));

    await expect(service.pingDatabase()).resolves.toBe(true);
  });

  it('pingDatabase returns false and warns when the query rejects', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const service = serviceWith(() =>
      Promise.reject(new Error('connection refused')),
    );

    await expect(service.pingDatabase()).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});
