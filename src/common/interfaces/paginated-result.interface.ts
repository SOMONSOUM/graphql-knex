import { PaginationMetaModel } from '@/common/dto/pagination-meta.model';

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMetaModel;
}
