import { Type } from '@nestjs/common';
import { Field, ObjectType } from '@nestjs/graphql';
import { PaginationMetaModel } from '@/common/dto/pagination-meta.model';
import type { PaginatedResult } from '@/common/interfaces/paginated-result.interface';

export function Paginated<T>(ItemClass: Type<T>) {
  @ObjectType({ isAbstract: true })
  abstract class PaginatedType {
    @Field(() => [ItemClass]) data: T[];
    @Field(() => PaginationMetaModel) meta: PaginationMetaModel;
  }
  return PaginatedType as Type<PaginatedResult<T>>;
}
