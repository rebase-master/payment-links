import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Rejects Unicode control characters (\p{Cc}: NUL, newline, tab, ESC, ...).
// Postgres cannot store NUL in a text column, so without this a NUL reaches
// the database and surfaces as a masked 500. \p{Cc} rather than \p{C}: the
// wider class also matches format characters such as the zero-width joiner
// used inside emoji sequences.

@ValidatorConstraint({ name: 'hasNoControlChars', async: false })
export class HasNoControlCharsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && !/\p{Cc}/u.test(value);
  }
  defaultMessage(): string {
    return '$property must not contain control characters';
  }
}
