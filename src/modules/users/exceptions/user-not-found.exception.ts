import { ErrorCode } from '@/common/enums/error-code.enum';
import { NotFoundException } from '@/common/exceptions/http.exceptions';

export class UserNotFoundException extends NotFoundException {
  constructor() {
    super('User not found', ErrorCode.USER_NOT_FOUND);
  }
}
