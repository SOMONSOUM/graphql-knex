import { ErrorCode } from '@/common/enums/error-code.enum';
import { UnauthorizedException } from '@/common/exceptions/http.exceptions';

export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super('Invalid email or password', ErrorCode.INVALID_CREDENTIALS);
  }
}
