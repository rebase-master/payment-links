import type { ApolloDriverConfig } from '@nestjs/apollo';
import { NodeEnv } from '../../config/env.validation';
import { maskError } from './mask-error';

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
  };
}
