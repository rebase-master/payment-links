import { Logger } from '@nestjs/common';
import type { GraphQLFormattedError } from 'graphql';

const logger = new Logger('GraphQL');

// Codes whose messages are safe to return verbatim: our curated domain errors
// plus the standard client-fault codes. Everything else — Prisma, pg, or any
// unexpected throw — is masked so internals (source paths, SQL) never reach a
// client, and the original is logged server-side instead.
const PASS_THROUGH_CODES = new Set([
  'PAYMENT_LINK_NOT_FOUND',
  'PAYMENT_LINK_NOT_PAYABLE',
  'UNSUPPORTED_CURRENCY',
  'IDEMPOTENCY_KEY_CONFLICT',
  'IDEMPOTENCY_IN_PROGRESS',
  'BAD_REQUEST',
  'BAD_USER_INPUT',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'GRAPHQL_VALIDATION_FAILED',
  'GRAPHQL_PARSE_FAILED',
]);

export function maskError(
  formattedError: GraphQLFormattedError,
): GraphQLFormattedError {
  const code = formattedError.extensions?.code;
  if (typeof code === 'string' && PASS_THROUGH_CODES.has(code)) {
    return formattedError;
  }

  const codeLabel = typeof code === 'string' ? code : 'no-code';
  logger.error(
    `masked GraphQL error [${codeLabel}]: ${formattedError.message}`,
  );
  return {
    message: 'Internal server error',
    extensions: { code: 'INTERNAL_SERVER_ERROR' },
  };
}
