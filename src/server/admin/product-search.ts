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

// ------------------------------------------------------------ list rows

/** Stock situation of a list row: the badge uses the same rule as the "sin"/"bajo"/"pedido" filters. */
export type StockState = "untracked" | "out" | "low" | "in";

/**
 * Mirrors searchProducts' stock filters: untracked = "pedido"; available
 * (on hand - reserved) <= 0 = "sin"; 1..threshold = "bajo", where the
 * threshold is the product's own one or LOW_STOCK.
 */
export function productStockState(product: { trackStock: boolean; onHand: number; reserved: number; lowStockThreshold?: number | null }): StockState {
  if (!product.trackStock) return "untracked";
  const available = product.onHand - product.reserved;
  if (available <= 0) return "out";
  return available <= (product.lowStockThreshold ?? LOW_STOCK) ? "low" : "in";
}

export type ListPrice = { kind: "fixed" | "from"; minor: number } | { kind: "quote" } | { kind: "missing" };

/** Price column: quoted products, "desde" the lowest active variant when prices differ, else the default price. */
export function listPrice(product: { requiresQuote: boolean; priceMinor: number | null; minPriceMinor: number | null; maxPriceMinor: number | null }): ListPrice {
  if (product.requiresQuote) return { kind: "quote" };
  if (product.minPriceMinor !== null && product.maxPriceMinor !== null && product.minPriceMinor !== product.maxPriceMinor) {
    return { kind: "from", minor: product.minPriceMinor };
  }
  return product.priceMinor === null ? { kind: "missing" } : { kind: "fixed", minor: product.priceMinor };
}

// ------------------------------------------------------------ bulk actions

/** Status and featured changes offered on a list selection. */
export const BULK_PRODUCT_ACTIONS = ["publish", "draft", "archive", "feature", "unfeature"] as const;
export type BulkProductAction = (typeof BULK_PRODUCT_ACTIONS)[number];

/** Same shape as ProductChange (product-changes.ts). */
export function bulkProductChange(action: BulkProductAction): { status: ProductStatus } | { featured: boolean } {
  switch (action) {
    case "publish":
      return { status: "active" };
    case "draft":
      return { status: "draft" };
    case "archive":
      return { status: "archived" };
    case "feature":
      return { featured: true };
    case "unfeature":
      return { featured: false };
  }
}

export type BulkProductInput = { ok: true; action: BulkProductAction; ids: string[] } | { ok: false; error: string };

/** Validates what the browser sends: a known action and 1..max product ids (unique strings). */
export function parseBulkProductInput(input: unknown, max: number): BulkProductInput {
  const data = (input ?? {}) as { action?: unknown; ids?: unknown };
  const action = pick(typeof data.action === "string" ? data.action : "", BULK_PRODUCT_ACTIONS);
  if (!action) return { ok: false, error: "Acción desconocida." };
  const ids = data.ids;
  if (!Array.isArray(ids) || !ids.length || !ids.every((id) => typeof id === "string" && id.length > 0 && id.length <= 40)) {
    return { ok: false, error: "Elegí al menos un producto." };
  }
  const unique = [...new Set(ids as string[])];
  if (unique.length > max) return { ok: false, error: `Podés cambiar hasta ${max} productos por vez.` };
  return { ok: true, action, ids: unique };
}

/** Past participle per action, singular and plural ("1 producto publicado"). */
const DONE: Record<BulkProductAction, [string, string]> = {
  publish: ["publicado", "publicados"],
  draft: ["pasado a borrador", "pasados a borrador"],
  archive: ["archivado", "archivados"],
  feature: ["destacado", "destacados"],
  unfeature: ["sin destacar", "sin destacar"],
};

type ResultItem = { id: string; name: string };

/** The toast after a bulk change: what changed, what already was that way, and each skipped product with its reason. */
export function bulkResultMessage(
  action: BulkProductAction,
  result: { changed: ResultItem[]; unchanged: ResultItem[]; skipped: (ResultItem & { reason: string })[] },
): { message: string; tone: "success" | "info" | "warning" | "critical" } {
  const changed = result.changed.length;
  const parts = [
    changed ? `${changed} ${changed === 1 ? "producto" : "productos"} ${DONE[action][changed === 1 ? 0 : 1]}.` : `Ningún producto ${DONE[action][0]}.`,
  ];
  if (result.unchanged.length) parts.push(`${result.unchanged.length} sin cambios.`);
  const skipped = result.skipped.length;
  if (skipped) {
    const reasons = result.skipped.map((item) => `${item.name} (${item.reason.replace(/\.$/, "")})`).join("; ");
    parts.push(`${skipped} ${skipped === 1 ? "no se pudo" : "no se pudieron"}: ${reasons}.`);
  }
  const tone = skipped ? (changed ? "warning" : "critical") : changed ? "success" : "info";
  return { message: parts.join(" "), tone };
}
