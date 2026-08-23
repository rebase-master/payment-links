import { Catch } from '@nestjs/common';
import { GqlExceptionFilter } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { DomainError } from '../errors/domain.errors';

// Maps every DomainError to a clean GraphQLError carrying its stable `code` in
// extensions, so clients branch on a machine-readable value and never see a
// stack trace or an opaque "Internal server error".
@Catch(DomainError)
export class DomainExceptionFilter implements GqlExceptionFilter {
  catch(exception: DomainError): GraphQLError {
    return new GraphQLError(exception.message, {
      extensions: { code: exception.code },
    });
  }
}
