import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { getRequest, getResponse } from '@/common/utils/context.util';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Kafka handlers are internal and not JWT-protected (global guards also run on them).
    if (context.getType() === 'rpc') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return isPublic ? true : super.canActivate(context);
  }

  getRequest(context: ExecutionContext) {
    return getRequest(context);
  }

  getResponse(context: ExecutionContext) {
    return getResponse(context);
  }
}
