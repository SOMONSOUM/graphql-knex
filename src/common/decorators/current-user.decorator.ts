import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { getRequest } from '@/common/utils/context.util';
import type { JwtPayload } from '@/modules/auth/interfaces/jwt-payload.interface';

export const CurrentUser = createParamDecorator(
  (field: keyof JwtPayload | undefined, context: ExecutionContext) => {
    const user = getRequest(context).user as JwtPayload | undefined;
    return field ? user?.[field] : user;
  },
);
