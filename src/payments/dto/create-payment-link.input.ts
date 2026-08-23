import { Field, InputType } from '@nestjs/graphql';
import {
  IsOptional,
  Matches,
  MaxLength,
  MinLength,
  Validate,
} from 'class-validator';
import { IsFutureDateStringConstraint } from '../../common/validation/is-future-date-string.validator';
import { IsInt64StringConstraint } from '../../common/validation/is-int64-string.validator';

@InputType()
export class CreatePaymentLinkInput {
  @Field({
    description: 'Amount in minor units, as a positive integer string.',
  })
  @Validate(IsInt64StringConstraint)
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
  @Validate(IsFutureDateStringConstraint)
  expiresAt?: string;

  @Field({
    description:
      'Client-generated key; retries with the same key are de-duplicated.',
  })
  @MinLength(1)
  @MaxLength(200)
  idempotencyKey!: string;
}
