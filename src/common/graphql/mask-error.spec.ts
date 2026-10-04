import { Logger } from '@nestjs/common';
import type { GraphQLFormattedError } from 'graphql';
import { maskError } from './mask-error';

describe('maskError', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const located = {
    locations: [{ line: 1, column: 12 }],
    path: ['payLink'],
  };

  it('returns only message, locations, path, and code for a pass-through error', () => {
    const formatted: GraphQLFormattedError = {
      message: 'Payment link x cannot be paid: expired',
      ...located,
      extensions: {
        code: 'PAYMENT_LINK_NOT_PAYABLE',
        stacktrace: ['Error: boom', '    at /app/src/payments.service.ts:42'],
        originalError: { internal: true },
      },
    };

    expect(maskError(formatted)).toEqual({
      message: 'Payment link x cannot be paid: expired',
      ...located,
      extensions: { code: 'PAYMENT_LINK_NOT_PAYABLE' },
    });
  });

  it('keeps class-validator messages on BAD_REQUEST as validationErrors', () => {
    const formatted: GraphQLFormattedError = {
      message: 'Bad Request Exception',
      ...located,
      extensions: {
        code: 'BAD_REQUEST',
        originalError: {
          message: ['description must not contain control characters'],
          error: 'Bad Request',
          statusCode: 400,
        },
      },
    };

    expect(maskError(formatted)).toEqual({
      message: 'Bad Request Exception',
      ...located,
      extensions: {
        code: 'BAD_REQUEST',
        validationErrors: ['description must not contain control characters'],
      },
    });
  });

  it('adds no validationErrors when BAD_REQUEST carries a single string message', () => {
    const formatted: GraphQLFormattedError = {
      message: 'Validation failed (uuid is expected)',
      ...located,
      extensions: {
        code: 'BAD_REQUEST',
        originalError: {
          message: 'Validation failed (uuid is expected)',
          statusCode: 400,
        },
      },
    };

    expect(maskError(formatted)).toEqual({
      message: 'Validation failed (uuid is expected)',
      ...located,
      extensions: { code: 'BAD_REQUEST' },
    });
  });

  it('masks an unknown code as a generic internal error', () => {
    const formatted: GraphQLFormattedError = {
      message: 'relation "payment_links" does not exist',
      extensions: { code: 'P2010' },
    };

    expect(maskError(formatted)).toEqual({
      message: 'Internal server error',
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
  });
});
