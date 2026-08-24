import { Injectable, Logger } from '@nestjs/common';
import {
  IdempotencyInProgressError,
  IdempotencyKeyConflictError,
} from '../common/errors/domain.errors';
import { Prisma } from '../generated/prisma/client';

export interface IdempotencyParams {
  scope: string;
  key: string;
  requestHash: string;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  // Runs `work` at most once per (scope, key). The claim is a single
  // INSERT ... ON CONFLICT DO NOTHING RETURNING inside the caller's
  // transaction: the unique index — not application code — decides the race,
  // and DO NOTHING (rather than a caught unique violation, which would abort
  // the transaction) keeps it alive so a duplicate can read back the stored
  // response.
  async execute<T extends Prisma.InputJsonValue>(
    tx: Prisma.TransactionClient,
    params: IdempotencyParams,
    work: () => Promise<T>,
  ): Promise<T> {
    const claimed = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "idempotency_keys" ("id", "scope", "key", "request_hash", "status")
      VALUES (gen_random_uuid(), ${params.scope}, ${params.key}, ${params.requestHash}, 'IN_PROGRESS'::"IdempotencyStatus")
      ON CONFLICT ("scope", "key") DO NOTHING
      RETURNING "id"
    `;

    const [claimedRow] = claimed;
    if (!claimedRow) {
      return this.replay(tx, params);
    }

    const result = await work();
    await tx.idempotencyKey.update({
      where: { id: claimedRow.id },
      data: { status: 'COMPLETED', responseBody: result },
    });
    return result;
  }

  private async replay<T extends Prisma.InputJsonValue>(
    tx: Prisma.TransactionClient,
    params: IdempotencyParams,
  ): Promise<T> {
    const existing = await tx.idempotencyKey.findUnique({
      where: { scope_key: { scope: params.scope, key: params.key } },
    });

    if (existing && existing.requestHash !== params.requestHash) {
      // Same key, different request — a client bug, not a legitimate retry.
      throw new IdempotencyKeyConflictError(params.key);
    }
    if (
      !existing ||
      existing.status !== 'COMPLETED' ||
      existing.responseBody === null
    ) {
      // The ON CONFLICT fired, so a completed row is expected; anything else
      // is a concurrent in-flight request (or an invariant breach). Surface
      // it rather than returning a wrong or empty result.
      throw new IdempotencyInProgressError(params.key);
    }

    this.logger.log(`idempotency replay for ${params.scope}:${params.key}`);
    return existing.responseBody as unknown as T;
  }
}
