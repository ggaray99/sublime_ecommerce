import { ORDER_STATUSES, type OrderStatus } from "./repository.ts";
import { DELIVERY_FILTERS, PAYMENT_FILTERS } from "./status-view.ts";

/**
 * Admin order list filters (/admin/pedidos?q=…&pago=pendiente). They travel in
 * the URL so a filtered view can be bookmarked or shared; unknown values are
 * ignored (same rules as product-search.ts). `estado` is the exact status the
 * Inicio dashboard links to; `pago` and `entrega` are the derived views of
 * status-view.ts.
 */
export const ORDER_SORTS = ["recientes", "antiguos", "total-desc", "total-asc"] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];

export type OrderSearch = {
  /** Order number (SUB-1010 or 1010), contact name or email. */
  query: string;
  /** Exact status (?estado=, used by the dashboard links). */
  status?: OrderStatus;
  /** A PAYMENT_FILTERS value. */
  payment?: string;
  /** A DELIVERY_FILTERS value. */
  delivery?: string;
  /** Argentina dates, YYYY-MM-DD, both inclusive. */
  from?: string;
  to?: string;
  sort: OrderSort;
  page: number;
};

/** URL parameter names, in Spanish like the other admin lists. */
const KEYS = {
  query: "q",
  status: "estado",
  payment: "pago",
  delivery: "entrega",
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

export function parseOrderSearch(params: Params): OrderSearch {
  const page = Number(one(params, KEYS.page));
  return {
    query: one(params, KEYS.query).slice(0, 80),
    status: pick(one(params, KEYS.status), ORDER_STATUSES),
    payment: pick(
      one(params, KEYS.payment),
      PAYMENT_FILTERS.map((filter) => filter.value),
    ),
    delivery: pick(
      one(params, KEYS.delivery),
      DELIVERY_FILTERS.map((filter) => filter.value),
    ),
    from: isoDate(one(params, KEYS.from)),
    to: isoDate(one(params, KEYS.to)),
    sort: pick(one(params, KEYS.sort), ORDER_SORTS) ?? "recientes",
    page: Number.isInteger(page) && page > 1 && page < 10_000 ? page : 1,
  };
}

/** Builds the URL query for a search, omitting defaults (page 1, newest first, empty filters). */
export function orderSearchToQuery(search: OrderSearch, patch: Partial<OrderSearch> = {}): string {
  const next = { ...search, ...patch };
  const params = new URLSearchParams();
  for (const [field, key] of Object.entries(KEYS) as [keyof OrderSearch, string][]) {
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
export const hasActiveOrderFilters = (search: OrderSearch) =>
  Boolean(search.query || search.status || search.payment || search.delivery || search.from || search.to);
