import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';

export interface OutboxEvent {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
}

@Injectable()
export class OutboxService {
  // Appends an event within the caller's transaction, so it commits together
  // with the state change that produced it — the transactional-outbox
  // guarantee. A separate relay (later) drains unpublished rows to Kafka.
  async write(tx: Prisma.TransactionClient, event: OutboxEvent): Promise<void> {
    await tx.outboxMessage.create({
      data: {
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: event.payload,
      },
    });
  }
}
