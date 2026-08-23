import { Field, InputType } from '@nestjs/graphql';
import { IsISO8601, IsOptional, Matches, MaxLength } from 'class-validator';

@InputType()
export class CreatePaymentLinkInput {
  @Field({
    description: 'Amount in minor units, as a positive integer string.',
  })
  @Matches(/^[1-9]\d*$/, { message: 'amount must be a positive integer' })
  amount!: string;

  @Field()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(80)
  reference?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
