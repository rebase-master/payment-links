import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Merchant } from '../generated/prisma/client';
import { requestOf } from './api-key.guard';

export const CurrentMerchant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Merchant => {
    const { merchant } = requestOf(context);
    if (!merchant) {
      throw new Error(
        'CurrentMerchant requires ApiKeyGuard on the same handler',
      );
    }
    return merchant;
  },
);
