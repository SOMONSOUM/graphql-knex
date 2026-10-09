import { Module } from '@nestjs/common';
import { RbacModule } from '@/modules/rbac/rbac.module';
import { UserEventsController } from '@/modules/users/events/user-events.controller';
import { UserRepository } from '@/modules/users/repositories/user.repository';
import { UsersResolver } from '@/modules/users/users.resolver';
import { UsersService } from '@/modules/users/users.service';

@Module({
  imports: [RbacModule],
  controllers: [UserEventsController],
  providers: [UsersService, UserRepository, UsersResolver],
  exports: [UsersService, UserRepository],
})
export class UsersModule {}
