import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { getRequest, getResponse } from '@/common/utils/context.util';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    return { req: getRequest(context), res: getResponse(context) };
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    return context.getType() === 'rpc'; // never throttle Kafka handlers
  }
}
