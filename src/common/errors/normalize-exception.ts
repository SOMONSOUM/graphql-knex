import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@/common/enums/error-code.enum';
import { AppException } from '@/common/exceptions/app.exception';

export interface MysqlError {
  code: string;
  errno: number;
  sqlMessage?: string;
}

export const isMysqlError = (error: unknown): error is MysqlError =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as MysqlError).code === 'string' &&
  typeof (error as MysqlError).errno === 'number' &&
  ('sqlState' in error || 'sqlMessage' in error);

export interface NormalizedError {
  statusCode: number;
  errorCode: ErrorCode;
  message: string;
  details?: unknown;
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.TOO_MANY_REQUESTS,
};

export function normalizeException(exception: unknown): NormalizedError {
  // 1. Our per-case exceptions
  if (exception instanceof AppException) {
    return {
      statusCode: exception.getStatus(),
      errorCode: exception.errorCode,
      message: exception.message,
      details: exception.details,
    };
  }

  // 2. Nest/HTTP exceptions (Passport 401, throttler 429, ...)
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const body = exception.getResponse();
    if (statusCode === HttpStatus.TOO_MANY_REQUESTS) {
      return {
        statusCode,
        errorCode: ErrorCode.TOO_MANY_REQUESTS,
        message: 'Too Many Requests',
      };
    }

    const message =
      typeof body === 'string'
        ? body
        : ((body as { message?: string | string[] }).message ??
          exception.message);
    return {
      statusCode,
      errorCode: STATUS_TO_CODE[statusCode] ?? ErrorCode.INTERNAL_SERVER_ERROR,
      message: Array.isArray(message) ? message.join(', ') : message,
    };
  }

  // 3. MySQL errors surfaced through Knex
  if (isMysqlError(exception)) {
    switch (exception.errno) {
      case 1062: // ER_DUP_ENTRY
        return {
          statusCode: HttpStatus.CONFLICT,
          errorCode: ErrorCode.CONFLICT,
          message: 'A record with the same unique value already exists',
        };
      case 1452: // ER_NO_REFERENCED_ROW_2
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          errorCode: ErrorCode.BAD_REQUEST,
          message: 'A referenced record does not exist',
        };
      case 1451: // ER_ROW_IS_REFERENCED_2
        return {
          statusCode: HttpStatus.CONFLICT,
          errorCode: ErrorCode.CONFLICT,
          message: 'The record is still referenced by other records',
        };
    }
  }

  // 4. Everything else: never leak internals
  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
    message: 'Internal server error',
  };
}
