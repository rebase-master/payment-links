import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const MAX_INT64 = 9223372036854775807n;

// Validates a positive-integer string that fits a signed 64-bit column. A
// length cap alone is not enough — "9999999999999999999" is 19 digits but
// still overflows BIGINT — so the value itself is range-checked. Without this
// an overflow reaches Prisma and surfaces as a 500 that leaks internals.
@ValidatorConstraint({ name: 'isInt64String', async: false })
export class IsInt64StringConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
      return false;
    }
    try {
      return BigInt(value) <= MAX_INT64;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'amount must be a positive integer within int64 range';
  }
}
