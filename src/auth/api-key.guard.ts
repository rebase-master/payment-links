import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';
import type { Merchant } from '../generated/prisma/client';
import { ApiKeyService } from './api-key.service';

export interface AuthenticatedRequest extends Request {
  merchant?: Merchant;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = requestOf(context);

    const apiKey = bearerToken(request);
    if (!apiKey) {
      throw new UnauthorizedException('Missing API key');
    }

    const merchant = await this.apiKeys.resolveMerchant(apiKey);
    if (!merchant) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.merchant = merchant;
    return true;
  }
}

// Reads the underlying request from either a GraphQL or an HTTP execution
// context, so the guard and @CurrentMerchant work under both transports.
export function requestOf(context: ExecutionContext): AuthenticatedRequest {
  if (context.getType<'graphql'>() === 'graphql') {
    return GqlExecutionContext.create(context).getContext<{
      req: AuthenticatedRequest;
    }>().req;
  }
  return context.switchToHttp().getRequest<AuthenticatedRequest>();
}

function bearerToken(request: AuthenticatedRequest): string | null {
  const header = request.headers.authorization;
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(' ');
  // Auth schemes are case-insensitive per RFC 7235.
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}
