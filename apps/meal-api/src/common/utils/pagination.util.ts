export type PaginationInput = {
  page?: string | number;
  limit?: string | number;
  skip?: string | number;
  take?: string | number;
};

export type PaginationResult = {
  skip: number;
  take: number;
  page: number;
  limit: number;
};

export function resolvePagination(query: PaginationInput, defaultLimit = 20): PaginationResult {
  const limit = Math.min(
    Math.max(Number(query.limit ?? query.take ?? defaultLimit) || defaultLimit, 1),
    200,
  );

  if (query.skip !== undefined && query.skip !== null && query.skip !== '') {
    const skip = Math.max(Number(query.skip) || 0, 0);
    const page = Math.floor(skip / limit) + 1;
    return { skip, take: limit, page, limit };
  }

  const page = Math.max(Number(query.page ?? 1) || 1, 1);
  return { skip: (page - 1) * limit, take: limit, page, limit };
}

export function paginatedMeta(total: number, page: number, limit: number) {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}
