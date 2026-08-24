import { IsInt64StringConstraint } from './is-int64-string.validator';

describe('IsInt64StringConstraint', () => {
  const constraint = new IsInt64StringConstraint();

  it('accepts a positive integer within int64', () => {
    expect(constraint.validate('2500')).toBe(true);
    expect(constraint.validate('9223372036854775807')).toBe(true);
  });

  it('rejects a value that overflows int64', () => {
    expect(constraint.validate('9223372036854775808')).toBe(false);
    expect(constraint.validate('9999999999999999999')).toBe(false);
  });

  it('rejects zero, negatives, and non-integers', () => {
    expect(constraint.validate('0')).toBe(false);
    expect(constraint.validate('-5')).toBe(false);
    expect(constraint.validate('12.5')).toBe(false);
    expect(constraint.validate('abc')).toBe(false);
  });

  it('rejects a non-string', () => {
    expect(constraint.validate(2500)).toBe(false);
  });
});
