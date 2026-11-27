import { PRODUCT_STATUSES, type ProductStatus } from "./validation.ts";

/**
 * Admin product list filters. They travel in the URL (/admin/productos?categoria=…&stock=sin)
 * so a filtered view can be bookmarked or shared; unknown values are ignored.
 */
export const STOCK_FILTERS = ["con", "sin", "bajo", "pedido"] as const;
export const IMAGE_FILTERS = ["con", "sin"] as const;
export const FEATURED_FILTERS = ["si", "no"] as const;
export const PRODUCT_SORTS = ["orden", "nombre", "precio-asc", "precio-desc", "stock-asc", "modificado"] as const;

export type StockFilter = (typeof STOCK_FILTERS)[number];
export type ImageFilter = (typeof IMAGE_FILTERS)[number];
export type FeaturedFilter = (typeof FEATURED_FILTERS)[number];
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export type ProductSearch = {
  query: string;
  status?: ProductStatus;
  categoryId?: string;
  theme?: string;
  stock?: StockFilter;
  images?: ImageFilter;
  featured?: FeaturedFilter;
  sort: ProductSort;
  page: number;
  /** API only: products changed at or after this instant (incremental sync). */
  updatedSince?: Date;
  /** API only: 1–200; the admin list always uses PAGE_SIZE. */
  pageSize?: number;
};

/** "Stock bajo" threshold, also used to highlight rows. */
export const LOW_STOCK = 5;
export const PAGE_SIZE = 50;

/** URL parameter names, in Spanish like the store filters. */
const KEYS = {
  query: "q",
  status: "estado",
  categoryId: "categoria",
  theme: "tematica",
  stock: "stock",
  images: "imagenes",
  featured: "destacado",
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

export function parseProductSearch(params: Params): ProductSearch {
  const categoryId = one(params, KEYS.categoryId);
  const theme = one(params, KEYS.theme);
  const page = Number(one(params, KEYS.page));
  return {
    query: one(params, KEYS.query).slice(0, 60),
    status: pick(one(params, KEYS.status), PRODUCT_STATUSES),
    categoryId: /^[a-z0-9-]{1,40}$/.test(categoryId) ? categoryId : undefined,
    theme: /^[a-z]{1,30}$/.test(theme) ? theme : undefined,
    stock: pick(one(params, KEYS.stock), STOCK_FILTERS),
    images: pick(one(params, KEYS.images), IMAGE_FILTERS),
    featured: pick(one(params, KEYS.featured), FEATURED_FILTERS),
    sort: pick(one(params, KEYS.sort), PRODUCT_SORTS) ?? "orden",
    page: Number.isInteger(page) && page > 1 && page < 10_000 ? page : 1,
  };
}

/** Builds the URL query for a search, omitting defaults (page 1, default order, empty filters). */
export function productSearchToQuery(search: ProductSearch, patch: Partial<ProductSearch> = {}): string {
  const next = { ...search, ...patch };
  const params = new URLSearchParams();
  for (const [field, key] of Object.entries(KEYS) as [keyof ProductSearch, string][]) {
    const value = next[field];
    if (value === undefined || value === "") continue;
    if (field === "sort" && value === "orden") continue;
    if (field === "page" && value === 1) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const hasActiveFilters = (search: ProductSearch) =>
  Boolean(search.query || search.status || search.categoryId || search.theme || search.stock || search.images || search.featured);
