import { describe, expect, it } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ErrorCode } from '@/common/enums/error-code.enum';
import { normalizeException } from '@/common/errors/normalize-exception';
import { UserNotFoundException } from '@/modules/users/exceptions/user-not-found.exception';

describe('normalizeException', () => {
  it('keeps the error code of our own exceptions', () => {
    expect(normalizeException(new UserNotFoundException())).toMatchObject({
      statusCode: HttpStatus.NOT_FOUND,
      errorCode: ErrorCode.USER_NOT_FOUND,
    });
  });

  it('maps MySQL ER_DUP_ENTRY to a 409', () => {
    const mysqlError = {
      code: 'ER_DUP_ENTRY',
      errno: 1062,
      sqlState: '23000',
      sqlMessage: 'Duplicate entry',
    };
    expect(normalizeException(mysqlError)).toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      errorCode: ErrorCode.CONFLICT,
    });
  });

  it('normalizes throttler messages without leaking the exception class name', () => {
    expect(normalizeException(new ThrottlerException())).toMatchObject({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      errorCode: ErrorCode.TOO_MANY_REQUESTS,
      message: 'Too Many Requests',
    });
  });

  it('never leaks internals of unknown errors', () => {
    const normalized = normalizeException(new Error('db password is hunter2'));
    expect(normalized.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(normalized.message).toBe('Internal server error');
  });
});
