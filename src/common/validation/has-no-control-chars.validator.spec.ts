import { HasNoControlCharsConstraint } from './has-no-control-chars.validator';

describe('HasNoControlCharsConstraint', () => {
  const constraint = new HasNoControlCharsConstraint();

  it('rejects a NUL byte', () => {
    expect(constraint.validate('a\u0000b')).toBe(false);
  });

  it('rejects newline and tab', () => {
    expect(constraint.validate('line1\nline2')).toBe(false);
    expect(constraint.validate('a\tb')).toBe(false);
  });

  it('accepts plain text and a zero-width-joiner emoji', () => {
    expect(constraint.validate('Invoice #42 - cafe')).toBe(true);
    expect(constraint.validate('👨‍👩‍👧')).toBe(true);
  });
});
