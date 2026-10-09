import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@/common/enums/error-code.enum';

export abstract class AppException extends HttpException {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string,
    status: HttpStatus,
    public readonly details?: unknown,
  ) {
    super({ errorCode, message, details }, status);
  }
}
