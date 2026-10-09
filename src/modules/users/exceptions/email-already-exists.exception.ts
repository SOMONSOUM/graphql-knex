import { ErrorCode } from '@/common/enums/error-code.enum';
import { ConflictException } from '@/common/exceptions/http.exceptions';

export class EmailAlreadyExistsException extends ConflictException {
  constructor() {
    super(
      'A user with this email already exists',
      ErrorCode.EMAIL_ALREADY_EXISTS,
    );
  }
}
