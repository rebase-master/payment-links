import { NodeEnv } from '../../config/env.validation';
import { graphqlOptions } from './graphql-options';
import { maskError } from './mask-error';

describe('graphqlOptions', () => {
  it.each(Object.values(NodeEnv))(
    'pins the hardening options in %s',
    (nodeEnv) => {
      expect(graphqlOptions(nodeEnv)).toMatchObject({
        playground: false,
        includeStacktraceInErrorResponses: false,
        allowBatchedHttpRequests: false,
      });
    },
  );

  it('disables introspection only in production', () => {
    expect(graphqlOptions(NodeEnv.Production).introspection).toBe(false);
    expect(graphqlOptions(NodeEnv.Development).introspection).toBe(true);
    expect(graphqlOptions(NodeEnv.Test).introspection).toBe(true);
  });

  it('keeps the code-first schema and error masking', () => {
    expect(graphqlOptions(NodeEnv.Test)).toMatchObject({
      autoSchemaFile: true,
      formatError: maskError,
    });
  });
});
