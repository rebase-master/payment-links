// Transport-agnostic failure vocabulary for the money path. Each carries a
// stable machine-readable `code`; the GraphQL exception filter maps these to
// client-facing errors, so services never reach for HTTP/GraphQL concerns.
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class PaymentLinkNotFoundError extends DomainError {
  readonly code = 'PAYMENT_LINK_NOT_FOUND';

  constructor(paymentLinkId: string) {
    super(`Payment link ${paymentLinkId} was not found`);
  }
}

export class PaymentLinkNotPayableError extends DomainError {
  readonly code = 'PAYMENT_LINK_NOT_PAYABLE';

  constructor(paymentLinkId: string, reason: string) {
    super(`Payment link ${paymentLinkId} cannot be paid: ${reason}`);
  }
}

export class CurrencyMismatchError extends DomainError {
  readonly code = 'CURRENCY_MISMATCH';

  constructor(expected: string, received: string) {
    super(`Currency mismatch: expected ${expected}, received ${received}`);
  }
}

export class IdempotencyKeyConflictError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_CONFLICT';

  constructor(key: string) {
    super(`Idempotency key "${key}" was already used with a different request`);
  }
}

export class IdempotencyInProgressError extends DomainError {
  readonly code = 'IDEMPOTENCY_IN_PROGRESS';

  constructor(key: string) {
    super(`A request with idempotency key "${key}" is still in progress`);
  }
}
