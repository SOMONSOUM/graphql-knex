import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@/common/enums/error-code.enum';
import { AppException } from '@/common/exceptions/app.exception';

export class BadRequestException extends AppException {
  constructor(
    message = 'Bad request',
    errorCode = ErrorCode.BAD_REQUEST,
    details?: unknown,
  ) {
    super(errorCode, message, HttpStatus.BAD_REQUEST, details);
  }
}
export class UnauthorizedException extends AppException {
  constructor(
    message = 'Unauthorized',
    errorCode = ErrorCode.UNAUTHORIZED,
    details?: unknown,
  ) {
    super(errorCode, message, HttpStatus.UNAUTHORIZED, details);
  }
}
export class ForbiddenException extends AppException {
  constructor(
    message = 'Forbidden',
    errorCode = ErrorCode.FORBIDDEN,
    details?: unknown,
  ) {
    super(errorCode, message, HttpStatus.FORBIDDEN, details);
  }
}
export class NotFoundException extends AppException {
  constructor(
    message = 'Resource not found',
    errorCode = ErrorCode.NOT_FOUND,
    details?: unknown,
  ) {
    super(errorCode, message, HttpStatus.NOT_FOUND, details);
  }
}
export class ConflictException extends AppException {
  constructor(
    message = 'Conflict',
    errorCode = ErrorCode.CONFLICT,
    details?: unknown,
  ) {
    super(errorCode, message, HttpStatus.CONFLICT, details);
  }
}
