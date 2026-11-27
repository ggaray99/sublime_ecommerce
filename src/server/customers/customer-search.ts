/**
 * Admin customer list filters (/admin/clientes?q=…&tipo=admins). They travel in
 * the URL so a filtered view can be bookmarked or shared; unknown values are
 * ignored (same rules as orders/order-search.ts).
 */
export const CUSTOMER_TYPES = ["con-pedidos-pagados", "sin-pedidos", "con-encargos", "admins"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CUSTOMER_SORTS = ["recientes", "antiguos", "nombre", "total-desc", "ultimo-pedido"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export const CUSTOMER_PAGE_SIZE = 50;

export type CustomerSearch = {
  /** Name, email or phone; % and _ are literal. */
  query: string;
  type?: CustomerType;
  /** Sign-up dates in Argentina, YYYY-MM-DD, both inclusive. */
  from?: string;
  to?: string;
  sort: CustomerSort;
  page: number;
};

/** URL parameter names, in Spanish like the other admin lists. */
const KEYS = {
  query: "q",
  type: "tipo",
  from: "desde",
  to: "hasta",
  sort: "orden",
  page: "pagina",
} as const;

type Params = Record<string, string | string[] | undefined>;

const one = (params: Params, key: string) => {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
};

const pick = <T extends string>(value: string, allowed: readonly T[]) =>
  (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

/** A real calendar date in YYYY-MM-DD (2026-02-30 is not). */
function isoDate(value: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : undefined;
}

export function parseCustomerSearch(params: Params): CustomerSearch {
  const page = Number(one(params, KEYS.page));
  return {
    query: one(params, KEYS.query).slice(0, 100),
    type: pick(one(params, KEYS.type), CUSTOMER_TYPES),
    from: isoDate(one(params, KEYS.from)),
    to: isoDate(one(params, KEYS.to)),
    sort: pick(one(params, KEYS.sort), CUSTOMER_SORTS) ?? "recientes",
    page: Number.isInteger(page) && page > 1 && page < 10_000 ? page : 1,
  };
}

/** Builds the URL query for a search, omitting defaults (page 1, newest first, empty filters). */
export function customerSearchToQuery(search: CustomerSearch, patch: Partial<CustomerSearch> = {}): string {
  const next = { ...search, ...patch };
  const params = new URLSearchParams();
  for (const [field, key] of Object.entries(KEYS) as [keyof CustomerSearch, string][]) {
    const value = next[field];
    if (value === undefined || value === "") continue;
    if (field === "sort" && value === "recientes") continue;
    if (field === "page" && value === 1) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Whether the list is narrowed by anything (sort and page do not narrow it). */
export const hasActiveCustomerFilters = (search: CustomerSearch) => Boolean(search.query || search.type || search.from || search.to);

/** Start of an Argentina day (UTC−3, no daylight saving) as an instant. */
export const argentinaDayStart = (day: string) => new Date(`${day}T00:00:00-03:00`);

/** Start of the Argentina day after `day`: "hasta" includes its whole day. */
export const argentinaDayEnd = (day: string) => new Date(argentinaDayStart(day).getTime() + 24 * 60 * 60 * 1000);
