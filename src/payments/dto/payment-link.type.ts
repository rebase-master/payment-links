import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('PaymentLink')
export class PaymentLinkType {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'Amount in minor units (e.g. fils), as a string.' })
  amount!: string;

  @Field()
  currency!: string;

  @Field()
  status!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => String, { nullable: true })
  reference!: string | null;

  @Field(() => String, { nullable: true })
  expiresAt!: string | null;

  @Field()
  createdAt!: string;
}
