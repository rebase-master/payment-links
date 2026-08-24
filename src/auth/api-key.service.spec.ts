import { createHmac } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../database/prisma.service';
import { ApiKeyService } from './api-key.service';

const PEPPER = 'test-pepper';

function serviceWith(findUnique: jest.Mock): ApiKeyService {
  const prisma = { merchant: { findUnique } } as unknown as PrismaService;
  const config = {
    get: jest.fn().mockReturnValue(PEPPER),
  } as unknown as ConfigService;
  return new ApiKeyService(prisma, config);
}

describe('ApiKeyService', () => {
  it('hashes the key with HMAC-SHA256 keyed by the pepper (64-char hex)', () => {
    const service = serviceWith(jest.fn());
    // Computed independently of hash-api-key.ts, on purpose: this pins the
    // observable HMAC-SHA256 contract, so a regression inside hashApiKey()
    // itself still fails a test instead of passing trivially.
    const expected = createHmac('sha256', PEPPER)
      .update('secret-key')
      .digest('hex');

    const hash = service.hash('secret-key');

    expect(hash).toBe(expected);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('looks the merchant up by the hash of the key', async () => {
    const merchant = { id: 'm1' };
    const findUnique = jest.fn().mockResolvedValue(merchant);
    const service = serviceWith(findUnique);

    const result = await service.resolveMerchant('secret-key');

    expect(result).toBe(merchant);
    expect(findUnique).toHaveBeenCalledWith({
      where: { apiKeyHash: service.hash('secret-key') },
    });
  });

  it('returns null when no merchant matches', async () => {
    const service = serviceWith(jest.fn().mockResolvedValue(null));

    await expect(service.resolveMerchant('nope')).resolves.toBeNull();
  });
});
