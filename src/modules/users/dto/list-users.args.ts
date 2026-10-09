import { ArgsType, Field } from '@nestjs/graphql';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationArgs } from '@/common/dto/pagination.args';

@ArgsType()
export class ListUsersArgs extends PaginationArgs {
  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Every filter must be part of the cache key, or different queries would share one entry.
  get cacheKey(): string {
    return `${super.cacheKey}:${this.isActive ?? ''}`;
  }
}
