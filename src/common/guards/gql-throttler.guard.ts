import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';
import { RateLimitedError } from '../errors/domain.errors';

// ThrottlerGuard looks for the request on the HTTP context. In GraphQL it
// lives on the GraphQL context instead, so we point it there.
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  override getRequestResponse(context: ExecutionContext) {
    if (context.getType<'graphql'>() !== 'graphql') {
      return super.getRequestResponse(context);
    }
    const { req, res } = GqlExecutionContext.create(context).getContext<{
      req: Record<string, any>;
      res: Record<string, any>;
    }>();
    return { req, res };
  }

  // Throw our own error so it comes out as a normal RATE_LIMITED error.
  protected override throwThrottlingException(): Promise<void> {
    return Promise.reject(new RateLimitedError());
  }
}
