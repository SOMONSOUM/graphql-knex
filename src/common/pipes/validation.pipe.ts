import { ValidationError, ValidationPipe } from '@nestjs/common';
import { BadRequestException } from '@/common/exceptions/http.exceptions';
import { ErrorCode } from '@/common/enums/error-code.enum';

interface FieldError {
  field: string;
  errors: string[];
}

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints
      ? [{ field, errors: Object.values(error.constraints) }]
      : [];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

export const globalValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true, // instantiates classes, so getters like `skip` work
  exceptionFactory: (errors: ValidationError[]) =>
    new BadRequestException(
      'Validation failed',
      ErrorCode.VALIDATION_ERROR,
      flatten(errors),
    ),
});
