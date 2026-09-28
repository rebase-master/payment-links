import { Prisma } from '../generated/prisma/client';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function pgSqlState(error: unknown): string | undefined {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2010'
  ) {
    return undefined;
  }
  const adaptedError = error.meta?.driverAdapterError;
  if (!isRecord(adaptedError) || !isRecord(adaptedError.cause)) {
    return undefined;
  }
  const code = adaptedError.cause.originalCode;
  return typeof code === 'string' ? code : undefined;
}
