import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentMerchant } from '../auth/current-merchant.decorator';
import type { Merchant } from '../generated/prisma/client';
import { CreatePaymentLinkInput } from './dto/create-payment-link.input';
import { PayLinkInput } from './dto/pay-link.input';
import { PaymentLinkType } from './dto/payment-link.type';
import { PaymentType } from './dto/payment.type';
import {
  PaymentsService,
  type PaymentLinkResult,
  type PaymentResult,
} from './payments.service';

@Resolver()
export class PaymentsResolver {
  constructor(private readonly payments: PaymentsService) {}

  @Query(() => PaymentLinkType, { nullable: true })
  paymentLink(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<PaymentLinkResult | null> {
    return this.payments.getPaymentLink(id);
  }

  @Mutation(() => PaymentLinkType)
  @UseGuards(ApiKeyGuard)
  createPaymentLink(
    @CurrentMerchant() merchant: Merchant,
    @Args('input') input: CreatePaymentLinkInput,
  ): Promise<PaymentLinkResult> {
    return this.payments.createPaymentLink(merchant, {
      amount: BigInt(input.amount),
      currency: input.currency,
      description: input.description ?? null,
      reference: input.reference ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      idempotencyKey: input.idempotencyKey,
    });
  }

  @Mutation(() => PaymentType)
  payLink(@Args('input') input: PayLinkInput): Promise<PaymentResult> {
    return this.payments.payLink({
      paymentLinkId: input.paymentLinkId,
      idempotencyKey: input.idempotencyKey,
    });
  }
}
