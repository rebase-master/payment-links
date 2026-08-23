import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Validates an ISO-8601 timestamp that is strictly in the future — a payment
// link cannot be created already expired.
@ValidatorConstraint({ name: 'isFutureDateString', async: false })
export class IsFutureDateStringConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    const time = Date.parse(value);
    return !Number.isNaN(time) && time > Date.now();
  }

  defaultMessage(): string {
    return 'expiresAt must be a valid ISO-8601 timestamp in the future';
  }
}
