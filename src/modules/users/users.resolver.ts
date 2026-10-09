import { ParseUUIDPipe } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Can } from '@/common/decorators/permissions.decorator';
import type { JwtPayload } from '@/modules/auth/interfaces/jwt-payload.interface';
import { ListUsersArgs } from '@/modules/users/dto/list-users.args';
import { UpdateUserInput } from '@/modules/users/dto/update-user.input';
import { PaginatedUsersModel } from '@/modules/users/models/paginated-users.model';
import { UserModel } from '@/modules/users/models/user.model';
import { UsersService } from '@/modules/users/users.service';

@Resolver(() => UserModel)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Can('read', 'users')
  @Query(() => PaginatedUsersModel)
  users(@Args() args: ListUsersArgs) {
    return this.usersService.findAll(args);
  }

  @Can('read', 'users')
  @Query(() => UserModel)
  user(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Query(() => UserModel)
  me(@CurrentUser() user: JwtPayload) {
    return this.usersService.findOne(user.sub);
  }

  @Mutation(() => UserModel)
  updateMe(
    @CurrentUser() user: JwtPayload,
    @Args('input') input: UpdateUserInput,
  ) {
    return this.usersService.update(user.sub, input);
  }

  @Can('delete', 'users')
  @Mutation(() => Boolean)
  async deleteUser(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
    await this.usersService.remove(id);
    return true;
  }
}
