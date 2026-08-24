import { IsFutureDateStringConstraint } from './is-future-date-string.validator';

describe('IsFutureDateStringConstraint', () => {
  const constraint = new IsFutureDateStringConstraint();
  const future = new Date(Date.now() + 86_400_000).toISOString();

  it('accepts a future ISO-8601 timestamp with an offset', () => {
    expect(constraint.validate(future)).toBe(true);
  });

  it('rejects a past timestamp', () => {
    expect(constraint.validate('2000-01-01T00:00:00.000Z')).toBe(false);
  });

  it('rejects a year-only string', () => {
    expect(constraint.validate('2099')).toBe(false);
  });

  it('rejects a non-ISO date string', () => {
    expect(constraint.validate('Mar 1 2099')).toBe(false);
  });

  it('rejects a timestamp with no offset', () => {
    expect(constraint.validate('2099-01-01T00:00:00')).toBe(false);
  });

  it('rejects a non-string', () => {
    expect(constraint.validate(12345)).toBe(false);
  });
});
