import type { Request } from "express";

export function parsePagination(req: Request, defaults: { page?: number; limit?: number; maxLimit?: number } = {}) {
  const page = Math.max(1, parseInt(req.query.page as string) || defaults.page || 1);
  const maxLimit = defaults.maxLimit ?? 200;
  const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || defaults.limit || 20), maxLimit);
  const offset = (page - 1) * limit;
  const cursor = req.query.cursor ? parseInt(req.query.cursor as string) : undefined;
  return { page, limit, offset, cursor };
}

export function paginatedResponse<T>(items: T[], total: number, page: number, limit: number, extra?: Record<string, unknown>) {
  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    ...extra,
  };
}
