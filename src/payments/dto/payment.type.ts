import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('Payment')
export class PaymentType {
  @Field(() => ID)
  paymentId!: string;

  @Field(() => ID)
  paymentLinkId!: string;

  @Field()
  status!: string;

  @Field({ description: 'Amount in minor units, as a string.' })
  amount!: string;

  @Field()
  currency!: string;
}
