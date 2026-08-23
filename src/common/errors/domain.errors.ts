// Transport-agnostic failure vocabulary for the money path. Each carries a
// stable machine-readable `code` and an `httpStatus` (used to decide log level
// and, on HTTP routes, the response status); the exception filter maps these to
// client-facing errors, so services never reach for HTTP/GraphQL concerns.
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class PaymentLinkNotFoundError extends DomainError {
  readonly code = 'PAYMENT_LINK_NOT_FOUND';
  readonly httpStatus = 404;

  constructor(paymentLinkId: string) {
    super(`Payment link ${paymentLinkId} was not found`);
  }
}

export class PaymentLinkNotPayableError extends DomainError {
  readonly code = 'PAYMENT_LINK_NOT_PAYABLE';
  readonly httpStatus = 409;

  constructor(paymentLinkId: string, reason: string) {
    super(`Payment link ${paymentLinkId} cannot be paid: ${reason}`);
  }
}

// Ops misconfiguration, not a client fault — a 500 that is logged at error and
// masked from the client by maskError.
export class PlatformAccountNotConfiguredError extends DomainError {
  readonly code = 'PLATFORM_ACCOUNT_NOT_CONFIGURED';
  readonly httpStatus = 500;

  constructor(currency: string) {
    super(`No platform clearing account is configured for ${currency}`);
  }
}

export class IdempotencyKeyConflictError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_CONFLICT';
  readonly httpStatus = 409;

  constructor(key: string) {
    super(`Idempotency key "${key}" was already used with a different request`);
  }
}

export class IdempotencyInProgressError extends DomainError {
  readonly code = 'IDEMPOTENCY_IN_PROGRESS';
  readonly httpStatus = 409;

  constructor(key: string) {
    super(`A request with idempotency key "${key}" is still in progress`);
  }
}
