import { Logger } from '@nestjs/common';
import type { GraphQLFormattedError } from 'graphql';

const logger = new Logger('GraphQL');

// Client-fault codes that Nest and Apollo produce themselves (validation,
// auth, malformed queries).
const FRAMEWORK_CLIENT_CODES = new Set([
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
  const status = formattedError.extensions?.status;
  const isClientError = typeof status === 'number' && status < 500;

  if (
    typeof code === 'string' &&
    (isClientError || FRAMEWORK_CLIENT_CODES.has(code))
  ) {
    return {
      message: formattedError.message,
      locations: formattedError.locations,
      path: formattedError.path,
      extensions: { code, ...validationErrors(formattedError) },
    };
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

function validationErrors(formattedError: GraphQLFormattedError): {
  validationErrors?: string[];
} {
  const original = formattedError.extensions?.originalError;
  if (
    formattedError.extensions?.code !== 'BAD_REQUEST' ||
    typeof original !== 'object' ||
    original === null ||
    !('message' in original) ||
    !Array.isArray(original.message)
  ) {
    return {};
  }
  const messages = (original.message as unknown[]).filter(
    (m): m is string => typeof m === 'string',
  );
  return messages.length > 0 ? { validationErrors: messages } : {};
}
