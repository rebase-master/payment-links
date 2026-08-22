import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const valid = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

  it('accepts valid config and applies defaults', () => {
    const env = validateEnv(valid);
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
  });

  it('coerces PORT from string to number', () => {
    expect(validateEnv({ ...valid, PORT: '4000' }).PORT).toBe(4000);
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('throws when DATABASE_URL is not a postgres URL', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://x/y' })).toThrow(
      /postgres/,
    );
  });

  it('throws when PORT is out of range', () => {
    expect(() => validateEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });

  it('throws when NODE_ENV is invalid', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });
});
