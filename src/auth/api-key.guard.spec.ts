import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ApiKeyGuard, type AuthenticatedRequest } from './api-key.guard';
import type { ApiKeyService } from './api-key.service';

function httpContextWith(
  request: Partial<AuthenticatedRequest>,
): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guardWith(resolveMerchant: jest.Mock): ApiKeyGuard {
  const apiKeys = { resolveMerchant } as unknown as ApiKeyService;
  return new ApiKeyGuard(apiKeys);
}

describe('ApiKeyGuard', () => {
  it('rejects a request with no Authorization header', async () => {
    const guard = guardWith(jest.fn());
    const context = httpContextWith({ headers: {} });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a key that resolves to no merchant', async () => {
    const guard = guardWith(jest.fn().mockResolvedValue(null));
    const context = httpContextWith({
      headers: { authorization: 'Bearer bad-key' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the merchant and allows a valid key', async () => {
    const merchant = { id: 'm1' };
    const guard = guardWith(jest.fn().mockResolvedValue(merchant));
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Bearer good-key' },
    };

    await expect(guard.canActivate(httpContextWith(request))).resolves.toBe(
      true,
    );
    expect(request.merchant).toBe(merchant);
  });
});
