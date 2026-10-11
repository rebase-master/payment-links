import type { ApolloDriverConfig } from '@nestjs/apollo';
import { NodeEnv } from '../../config/env.validation';
import { maskError } from './mask-error';
import type { Request, Response } from 'express';

export function graphqlOptions(
  nodeEnv: NodeEnv,
): Omit<ApolloDriverConfig, 'driver'> {
  return {
    autoSchemaFile: true,
    formatError: maskError,
    playground: false,
    introspection: nodeEnv !== NodeEnv.Production,
    includeStacktraceInErrorResponses: false,
    allowBatchedHttpRequests: false,
    context: ({ req, res }: { req: Request; res: Response }) => ({ req, res }),
  };
}
