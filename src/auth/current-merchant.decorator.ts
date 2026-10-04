import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { MerchantPrincipal } from './merchant-principal';
import { requestOf } from './api-key.guard';

export const CurrentMerchant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): MerchantPrincipal => {
    const { merchant } = requestOf(context);
    if (!merchant) {
      throw new Error(
        'CurrentMerchant requires ApiKeyGuard on the same handler',
      );
    }
    return merchant;
  },
);
