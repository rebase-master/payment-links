import { Injectable, Logger } from '@nestjs/common';
import {
  IdempotencyInProgressError,
  IdempotencyKeyConflictError,
} from '../common/errors/domain.errors';
import { Prisma } from '../generated/prisma/client';
import { pgSqlState } from '../database/pg-errors';

export interface IdempotencyParams {
  scope: string;
  key: string;
  ownerId: string;
  // Optional: callers whose key already uniquely identifies the request (e.g.
  // payLink, keyed by link id) omit it, and the conflict check is skipped.
  requestHash?: string;
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
    // Cap how long the claim may wait on another transaction holding the same
    // key: past this, Postgres raises 55P03 instead of blocking until a
    // statement or client timeout turns it into a 500. SET LOCAL would last
    // the whole transaction, so it is reset right after the claim; the
    // caller's work keeps the normal lock-wait behaviour.
    await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
    let claimed: { id: string }[];
    try {
      claimed = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "idempotency_keys" ("id", "scope", "owner_id", "key", "request_hash", "status")
      VALUES (gen_random_uuid(), ${params.scope}, ${params.ownerId}::uuid, ${params.key}, ${params.requestHash ?? ''}, 'IN_PROGRESS'::"IdempotencyStatus")
      ON CONFLICT ("scope", "owner_id", "key") DO NOTHING
      RETURNING "id"
    `;
    } catch (error: unknown) {
      // Another request holds this key and has not committed. The
      // transaction is now aborted, so throw before touching it again.
      if (pgSqlState(error) === '55P03') {
        throw new IdempotencyInProgressError(params.key);
      }
      throw error;
    }
    await tx.$executeRaw`SET LOCAL lock_timeout = DEFAULT`;

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
      where: {
        scope_ownerId_key: {
          scope: params.scope,
          ownerId: params.ownerId,
          key: params.key,
        },
      },
    });

    // Only meaningful when the caller provided a hash: same key with a
    // different request body is a client bug, not a legitimate retry.
    if (
      params.requestHash !== undefined &&
      existing &&
      existing.requestHash !== params.requestHash
    ) {
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
