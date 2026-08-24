import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Requires a full ISO-8601 datetime WITH an explicit offset (Z or ±HH:MM).
// Date.parse alone is too loose — it accepts "2027", "Mar 1 2030", and
// offset-less timestamps (parsed in the server's timezone), any of which would
// let an ambiguous or already-past expiry through.
const ISO_8601_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

@ValidatorConstraint({ name: 'isFutureDateString', async: false })
export class IsFutureDateStringConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !ISO_8601_WITH_OFFSET.test(value)) {
      return false;
    }
    const time = Date.parse(value);
    return !Number.isNaN(time) && time > Date.now();
  }

  defaultMessage(): string {
    return 'expiresAt must be an ISO-8601 timestamp with an offset, in the future';
  }
}
