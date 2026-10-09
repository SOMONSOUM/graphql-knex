import { ErrorCode } from '@/common/enums/error-code.enum';
import { UnauthorizedException } from '@/common/exceptions/http.exceptions';

export class InvalidRefreshTokenException extends UnauthorizedException {
  constructor() {
    super('Invalid or expired refresh token', ErrorCode.INVALID_REFRESH_TOKEN);
  }
}
