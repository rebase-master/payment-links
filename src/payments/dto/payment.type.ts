import { Field, ID, ObjectType } from '@nestjs/graphql';
import { PaymentStatus } from './enums';

@ObjectType('Payment')
export class PaymentType {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  paymentLinkId!: string;

  @Field(() => PaymentStatus)
  status!: PaymentStatus;

  @Field({ description: 'Amount in minor units, as a string.' })
  amount!: string;

  @Field()
  currency!: string;
}
