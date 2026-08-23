import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PaymentsService } from './payments.service';

@Module({
  imports: [IdempotencyModule, OutboxModule],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
