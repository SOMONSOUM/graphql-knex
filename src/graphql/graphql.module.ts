import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { ConfigService } from '@nestjs/config';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import depthLimit from 'graphql-depth-limit';
import { join } from 'path';
import type { Request, Response } from 'express';
import { formatError } from '@/graphql/format-error';

interface GraphQLContextFactoryArgs {
  req: Request;
  res: Response;
}

export const AppGraphQLModule = GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const sandbox = config.get<boolean>('graphql.sandboxEnabled', false);
    const isProd = config.get<boolean>('isProd', false);
    const writeSchema = config.get<string>('nodeEnv') === 'development';
    return {
      // Only in development is the schema file written to disk (commit it); otherwise it stays in memory.
      autoSchemaFile: writeSchema
        ? join(process.cwd(), 'src/schema.gql')
        : true,
      sortSchema: true,
      path: '/graphql',
      graphiql: false,
      playground: false,
      introspection: sandbox,
      csrfPrevention: true,
      includeStacktraceInErrorResponses: false,
      hideSchemaDetailsFromClientErrors: isProd, // no "Did you mean ..." hints when introspection is off
      plugins: sandbox
        ? [ApolloServerPluginLandingPageLocalDefault({ embed: true })]
        : [],
      validationRules: [depthLimit(8)],
      context: ({ req, res }: GraphQLContextFactoryArgs) => ({ req, res }),
      formatError,
    };
  },
});
