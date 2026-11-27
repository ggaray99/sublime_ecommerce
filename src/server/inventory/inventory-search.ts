import { MOVEMENT_KINDS } from "./movement-view.ts";

/**
 * Admin inventory filters (/admin/inventario?estado=bajo&… and
 * /admin/inventario/movimientos?tipo=…). They travel in the URL so a view can
 * be bookmarked or shared; unknown values are ignored (same rules as the other
 * admin lists).
 */
export const INVENTORY_STATES = ["sin", "bajo", "con"] as const;
export type InventoryState = (typeof INVENTORY_STATES)[number];

export const INVENTORY_SORTS = ["producto", "disponible-asc", "disponible-desc", "reservado-desc", "sku"] as const;
export type InventorySort = (typeof INVENTORY_SORTS)[number];

export const INVENTORY_PAGE_SIZE = 50;

export type InventorySearch = {
  /** Product name or SKU; % and _ are literal. */
  query: string;
  /** Same values and rule as the products list stock filter, applied per variant. */
  state?: InventoryState;
  categoryId?: string;
  /** "con-reservas": only variants with reserved units. */
  reserved?: "con-reservas";
  /** "todas": inactive variants too (hidden by default). */
  inactive?: "todas";
  sort: InventorySort;
  page: number;
};

export type MovementListSearch = {
  /** SKU or product name. */
  query: string;
  /** MOVEMENT_KINDS value. */
  kind?: string;
  /** Argentina dates, YYYY-MM-DD, both inclusive. */
  from?: string;
  to?: string;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;

const one = (params: Params, key: string) => {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
};

const pick = <T extends string>(value: string, allowed: readonly T[]) =>
  (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

const pageNumber = (value: string) => {
  const page = Number(value);
  return Number.isInteger(page) && page > 1 && page < 10_000 ? page : 1;
};

/** A real calendar date in YYYY-MM-DD (2026-02-30 is not). */
function isoDate(value: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : undefined;
}

/** Serializes fields in KEYS order, skipping empty values and the given defaults. */
function toQuery<T extends Record<string, unknown>>(next: T, keys: Record<string, string>, defaults: Partial<T>): string {
  const params = new URLSearchParams();
  for (const [field, key] of Object.entries(keys)) {
    const value = next[field];
    if (value === undefined || value === "" || value === defaults[field as keyof T]) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

// ------------------------------------------------------------ variant list

/** URL parameter names, in Spanish like the other admin lists. */
const INVENTORY_KEYS = {
  query: "q",
  state: "estado",
  categoryId: "categoria",
  reserved: "reservado",
  inactive: "activas",
  sort: "orden",
  page: "pagina",
} as const;

export function parseInventorySearch(params: Params): InventorySearch {
  const categoryId = one(params, INVENTORY_KEYS.categoryId);
  return {
    query: one(params, INVENTORY_KEYS.query).slice(0, 60),
    state: pick(one(params, INVENTORY_KEYS.state), INVENTORY_STATES),
    // Same shape as the products list category filter.
    categoryId: /^[a-z0-9-]{1,40}$/.test(categoryId) ? categoryId : undefined,
    reserved: pick(one(params, INVENTORY_KEYS.reserved), ["con-reservas"] as const),
    inactive: pick(one(params, INVENTORY_KEYS.inactive), ["todas"] as const),
    sort: pick(one(params, INVENTORY_KEYS.sort), INVENTORY_SORTS) ?? "producto",
    page: pageNumber(one(params, INVENTORY_KEYS.page)),
  };
}

/** Builds the URL query for a search, omitting defaults (page 1, by product, empty filters). */
export const inventorySearchToQuery = (search: InventorySearch, patch: Partial<InventorySearch> = {}) =>
  toQuery({ ...search, ...patch }, INVENTORY_KEYS, { sort: "producto", page: 1 });

/** Whether the list is narrowed by anything (sort and page do not narrow it). */
export const hasActiveInventoryFilters = (search: InventorySearch) =>
  Boolean(search.query || search.state || search.categoryId || search.reserved || search.inactive);

// ------------------------------------------------------------ movements

const MOVEMENT_KEYS = {
  query: "q",
  kind: "tipo",
  from: "desde",
  to: "hasta",
  page: "pagina",
} as const;

export function parseMovementSearch(params: Params): MovementListSearch {
  return {
    query: one(params, MOVEMENT_KEYS.query).slice(0, 60),
    kind: pick(
      one(params, MOVEMENT_KEYS.kind),
      MOVEMENT_KINDS.map((kind) => kind.value),
    ),
    from: isoDate(one(params, MOVEMENT_KEYS.from)),
    to: isoDate(one(params, MOVEMENT_KEYS.to)),
    page: pageNumber(one(params, MOVEMENT_KEYS.page)),
  };
}

export const movementSearchToQuery = (search: MovementListSearch, patch: Partial<MovementListSearch> = {}) =>
  toQuery({ ...search, ...patch }, MOVEMENT_KEYS, { page: 1 });

export const hasActiveMovementFilters = (search: MovementListSearch) => Boolean(search.query || search.kind || search.from || search.to);
