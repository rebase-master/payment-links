import { Field, ID, InputType } from '@nestjs/graphql';
import { IsUUID, MaxLength, MinLength } from 'class-validator';

@InputType()
export class PayLinkInput {
  @Field(() => ID)
  @IsUUID()
  paymentLinkId!: string;

  @Field({
    description:
      'Client-generated key; retries with the same key are de-duplicated.',
  })
  @MinLength(1)
  @MaxLength(200)
  idempotencyKey!: string;
}
