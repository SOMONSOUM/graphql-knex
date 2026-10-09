import { Module } from '@nestjs/common';
import { RbacRepository } from '@/modules/rbac/repositories/rbac.repository';
import { RbacService } from '@/modules/rbac/rbac.service';

@Module({
  providers: [RbacRepository, RbacService],
  exports: [RbacService],
})
export class RbacModule {}
