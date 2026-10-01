import { validate } from 'class-validator';
import { PayLinkInput } from './pay-link.input';

function build(overrides: Partial<PayLinkInput>) {
  return Object.assign(new PayLinkInput(), {
    paymentLinkId: '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b',
    idempotencyKey: 'key-1',
    ...overrides,
  });
}

describe('PaylinkInput', () => {
  it('accepts a valid input', async () => {
    expect(await validate(build({}))).toEqual([]);
  });

  it('rejects a control character in idempotencyKey', async () => {
    const errors = await validate(build({ idempotencyKey: 'a\u0000b' }));

    expect(errors.map((e) => e.property)).toEqual(['idempotencyKey']);
    expect(errors[0]?.constraints).toHaveProperty('hasNoControlChars');
  });
});
