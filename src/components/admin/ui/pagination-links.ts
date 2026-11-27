/** Search params as Next.js hands them to a page. */
export type SearchParamsRecord = Record<string, string | string[] | undefined>;

/**
 * The link to `page` of a list, keeping its other filters. Page 1 has no
 * parameter, like the existing product list (`?pagina=2`).
 */
export function pageHref(baseHref: string, searchParams: SearchParamsRecord, page: number, param = "pagina"): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === param || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) if (item !== "") params.append(key, item);
  }
  if (page > 1) params.set(param, String(page));
  const query = params.toString();
  return query ? `${baseHref}?${query}` : baseHref;
}

export type PaginationInput = {
  page: number;
  pageSize: number;
  /** Total rows, when the list counts them. */
  total?: number;
  /** Without a total, whether another page follows (e.g. a full page came back). */
  hasNext?: boolean;
};

export type PaginationState = {
  page: number;
  pageCount?: number;
  hasPrevious: boolean;
  hasNext: boolean;
  /** First row shown (1-based); 0 for an empty list. */
  from: number;
  /** Last row shown; unknown without a total. */
  to?: number;
  total?: number;
};

export function paginationState({ page, pageSize, total, hasNext }: PaginationInput): PaginationState {
  const requested = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  if (total === undefined) {
    return { page: requested, hasPrevious: requested > 1, hasNext: Boolean(hasNext), from: (requested - 1) * pageSize + 1 };
  }
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(requested, pageCount);
  return {
    page: current,
    pageCount,
    hasPrevious: current > 1,
    hasNext: current < pageCount,
    from: total === 0 ? 0 : (current - 1) * pageSize + 1,
    to: Math.min(current * pageSize, total),
    total,
  };
}
