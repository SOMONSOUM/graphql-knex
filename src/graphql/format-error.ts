import { HttpException, Logger } from '@nestjs/common';
import { GraphQLFormattedError } from 'graphql';
import { unwrapResolverError } from '@apollo/server/errors';
import {
  isMysqlError,
  normalizeException,
} from '@/common/errors/normalize-exception';

const logger = new Logger('GraphQL');

export function formatError(
  formatted: GraphQLFormattedError,
  error: unknown,
): GraphQLFormattedError {
  const original = unwrapResolverError(error);
  const known = original instanceof HttpException || isMysqlError(original);

  // Syntax / validation errors produced by GraphQL itself pass through untouched.
  if (!known && formatted.extensions?.code !== 'INTERNAL_SERVER_ERROR')
    return formatted;

  const n = normalizeException(original);
  if (n.statusCode >= 500) {
    logger.error(
      `${formatted.path?.join('.') ?? ''}: ${(original as Error)?.stack ?? String(original)}`,
    );
  }

  return {
    message: n.message,
    locations: formatted.locations,
    path: formatted.path,
    extensions: {
      code: n.errorCode,
      statusCode: n.statusCode,
      details: n.details,
    },
  };
}
