import { pgSqlState } from './pg-errors';

describe('pgSqlState', () => {
  it('returns undefined for an error that did not come from Postgres', () => {
    expect(pgSqlState(new Error('boom'))).toBeUndefined();
    expect(pgSqlState('not even an error')).toBeUndefined();
  });
});
