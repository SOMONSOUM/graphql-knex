import { ObjectType } from '@nestjs/graphql';
import { Paginated } from '@/common/dto/paginated';
import { UserModel } from '@/modules/users/models/user.model';

@ObjectType('PaginatedUsers')
export class PaginatedUsersModel extends Paginated(UserModel) {}
