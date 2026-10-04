import { ArgumentsHost } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { PaymentLinkNotPayableError } from '../errors/domain.errors';
import { DomainExceptionFilter } from './domain-exception.filter';

describe('DomainExceptionFilter', function () {
  const filter = new DomainExceptionFilter();
  const graphqlHost = { getType: () => 'graphql' } as unknown as ArgumentsHost;

  it('puts the code and HTTP status on the GraphQL error', () => {
    const error = filter.catch(
      new PaymentLinkNotPayableError('link-1', 'expired'),
      graphqlHost,
    );

    expect(error).toBeInstanceOf(GraphQLError);
    expect((error as GraphQLError).extensions).toEqual({
      code: 'PAYMENT_LINK_NOT_PAYABLE',
      status: 409,
    });
  });
});
