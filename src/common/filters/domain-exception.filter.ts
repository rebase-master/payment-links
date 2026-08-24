import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { GqlExceptionFilter } from '@nestjs/graphql';
import type { Response } from 'express';
import { GraphQLError } from 'graphql';
import { DomainError } from '../errors/domain.errors';

// Maps every DomainError to its transport's error shape: a GraphQLError with
// the stable `code` in extensions on GraphQL, a `{ code, message }` body with
// the mapped status on HTTP. 5xx-class errors (ops misconfiguration) are logged
// at error; on GraphQL, maskError then hides their message from the client.
@Catch(DomainError)
export class DomainExceptionFilter implements GqlExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: DomainError, host: ArgumentsHost): GraphQLError | void {
    if (exception.httpStatus >= 500) {
      this.logger.error(`${exception.code}: ${exception.message}`);
    }

    if (host.getType<'graphql'>() === 'graphql') {
      return new GraphQLError(exception.message, {
        extensions: { code: exception.code },
      });
    }

    host
      .switchToHttp()
      .getResponse<Response>()
      .status(exception.httpStatus)
      .json({ code: exception.code, message: exception.message });
  }
}
