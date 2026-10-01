import { validate } from 'class-validator';
import { CreatePaymentLinkInput } from './create-payment-link.input';

function build(overrides: Partial<CreatePaymentLinkInput>) {
  return Object.assign(new CreatePaymentLinkInput(), {
    amount: '2500',
    currency: 'USD',
    idempotencyKey: 'key-1',
    ...overrides,
  });
}

describe('CreatePaymentLinkInput', () => {
  it('accepts a valid input', async () => {
    expect(await validate(build({}))).toEqual([]);
  });
  it.each(['description', 'reference', 'idempotencyKey'] as const)(
    'rejects a control character in %s',
    async (field) => {
      const errors = await validate(build({ [field]: 'a\u0000b' }));

      expect(errors.map((e) => e.property)).toEqual([field]);
      expect(errors[0]?.constraints).toHaveProperty('hasNoControlChars');
    },
  );
});
