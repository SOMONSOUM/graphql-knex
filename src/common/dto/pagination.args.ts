import { ArgsType, Field, Int, registerEnumType } from '@nestjs/graphql';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}
registerEnumType(SortOrder, { name: 'SortOrder' });

@ArgsType()
export class PaginationArgs {
  @Field(() => Int, { defaultValue: 1 })
  @IsInt()
  @Min(1)
  page: number;

  @Field(() => Int, { defaultValue: 20 })
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @Field({ defaultValue: 'createdAt' })
  @IsString()
  sortBy: string;

  @Field(() => SortOrder, { defaultValue: SortOrder.DESC })
  @IsIn([SortOrder.ASC, SortOrder.DESC])
  sortOrder: SortOrder;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }

  get sqlSortOrder(): 'asc' | 'desc' {
    return this.sortOrder === SortOrder.ASC ? 'asc' : 'desc';
  }

  /** Deterministic cache-key suffix. Subclasses MUST extend it with every extra filter. */
  get cacheKey(): string {
    return `${this.page}:${this.limit}:${this.search ?? ''}:${this.sortBy}:${this.sortOrder}`;
  }
}
