import { PaginationMetaModel } from '@/common/dto/pagination-meta.model';

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMetaModel {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}
