import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import { GraphQLResolveInfo } from 'graphql';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('GraphQL');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<GqlContextType>() !== 'graphql') return next.handle();

    const gql = GqlExecutionContext.create(context);
    const info = gql.getInfo<GraphQLResolveInfo>();
    // Log root operations only; per-field logging on list results is far too noisy.
    if (info.path.prev) return next.handle();

    const userId =
      (gql.getContext().req?.user as { sub?: string } | undefined)?.sub ??
      'anonymous';
    const label = `${info.parentType.name}.${info.fieldName}`;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.log(`${label} user=${userId} ${Date.now() - start}ms`),
        error: (err: Error) =>
          this.logger.warn(
            `${label} user=${userId} ${Date.now() - start}ms failed: ${err.message}`,
          ),
      }),
    );
  }
}
