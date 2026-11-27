import { productStockState, LOW_STOCK, type StockState } from "../admin/product-search.ts";
import { createAdminRepository } from "../admin/repository.ts";
import type { QueryFn } from "../customers/repository.ts";
import { INVENTORY_PAGE_SIZE, type InventorySearch, type InventorySort } from "./inventory-search.ts";

/*
 * Read-only views of the inventory for /admin/inventario. Nothing here writes:
 * stock, reservations and movements change only through the existing writers
 * (checkout, payments, cancellations, countStock). See docs/admin-inventory-audit.md.
 */

export type InventorySummary = {
  /** Products that keep stock (default variant tracked): Productos "con" + "sin". */
  trackedProducts: number;
  /** Tracked, active variants. */
  trackedVariants: number;
  /** Same count as Productos ?stock=sin and Inicio. */
  outOfStockProducts: number;
  /** Same count as Productos ?stock=bajo and Inicio. */
  lowStockProducts: number;
  /** Sum over tracked active variants of greatest(0, on_hand − reserved), like the store. */
  availableUnits: number;
  /** Units held by pending orders, over tracked active variants. */
  reservedUnits: number;
};

export type InventoryRow = {
  variantId: string;
  sku: string;
  /** "Talle M · Color Negro", or "Única" when the variant has no options. */
  optionsLabel: string;
  active: boolean;
  productId: string;
  productName: string;
  coverUrl: string;
  onHand: number;
  reserved: number;
  /** on_hand − reserved (never negative: the database checks reserved <= on_hand). */
  available: number;
  lowStockThreshold: number | null;
  state: StockState;
};

export type InventoryPage = { items: InventoryRow[]; total: number; page: number; pageSize: number; pages: number };

/** Same fallback as the products list when a product has no image. */
const FALLBACK_COVER = "/demo/categories/stickers.webp";

/** Options in the product's option order ("Talle M · Color Negro"); "Única" without options. */
export function variantOptionsLabel(optionNames: readonly string[], options: Record<string, string>): string {
  const label = optionNames
    .filter((name) => options[name])
    .map((name) => `${name} ${options[name]}`)
    .join(" · ");
  return label || "Única";
}

/** A movement delta for display: "+4", "−2" (minus sign), "—" for zero. */
export function signedQuantity(delta: number): string {
  if (delta === 0) return "—";
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

export async function inventorySummary(sql: QueryFn): Promise<InventorySummary> {
  const [facets, rows] = await Promise.all([
    // The product counts come from the products list's own query, so the numbers match.
    createAdminRepository(sql).productFacets(),
    sql.query(
      `SELECT count(*)::int AS variants,
              coalesce(sum(greatest(0, coalesce(i.on_hand, 0) - coalesce(i.reserved, 0))), 0)::int AS available,
              coalesce(sum(i.reserved), 0)::int AS reserved
       FROM product_variants v
       LEFT JOIN inventory i ON i.variant_id = v.id
       WHERE v.track_stock AND v.active`,
    ) as Promise<{ variants: number; available: number; reserved: number }[]>,
  ]);
  const [units] = rows;
  return {
    trackedProducts: facets.stock.con + facets.stock.sin,
    trackedVariants: units.variants,
    outOfStockProducts: facets.stock.sin,
    lowStockProducts: facets.stock.bajo,
    availableUnits: units.available,
    reservedUnits: units.reserved,
  };
}

const AVAILABLE = "(coalesce(i.on_hand, 0) - coalesce(i.reserved, 0))";

const SORTS: Record<InventorySort, string> = {
  producto: "p.name, v.is_default DESC, v.sku",
  "disponible-asc": `${AVAILABLE} ASC, p.name, v.sku`,
  "disponible-desc": `${AVAILABLE} DESC, p.name, v.sku`,
  "reservado-desc": "coalesce(i.reserved, 0) DESC, p.name, v.sku",
  sku: "v.sku",
};

/**
 * One row per tracked variant, filtered, sorted and paginated by the database.
 * The stock states are the products list rule (productStockState) applied to
 * each variant with the product's threshold. "A pedido" variants are not
 * inventory and never appear.
 */
export async function searchInventory(sql: QueryFn, search: InventorySearch & { pageSize?: number }): Promise<InventoryPage> {
  const pageSize = Math.min(Math.max(search.pageSize ?? INVENTORY_PAGE_SIZE, 1), 200);
  const text = search.query ? `%${search.query.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : null;
  const where = `
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN inventory i ON i.variant_id = v.id
    WHERE v.track_stock
      AND ($1::boolean OR v.active)
      AND ($2::text IS NULL OR p.name ILIKE $2 ESCAPE '\\' OR v.sku ILIKE $2 ESCAPE '\\')
      AND ($3::text IS NULL OR p.category_id = $3)
      AND ($4::text IS NULL
           OR ($4 = 'sin' AND ${AVAILABLE} <= 0)
           OR ($4 = 'con' AND ${AVAILABLE} > 0)
           OR ($4 = 'bajo' AND ${AVAILABLE} BETWEEN 1 AND coalesce(p.low_stock_threshold, $5::int)))
      AND (NOT $6::boolean OR coalesce(i.reserved, 0) > 0)`;
  const params = [search.inactive === "todas", text, search.categoryId ?? null, search.state ?? null, LOW_STOCK, search.reserved === "con-reservas"];

  const [{ total }] = (await sql.query(`SELECT count(*)::int AS total ${where}`, params)) as { total: number }[];
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(search.page, 1), pages);
  const rows = (await sql.query(
    `SELECT v.id, v.sku, v.options, v.active, p.legacy_id, p.name, p.option_names, p.low_stock_threshold,
            coalesce(i.on_hand, 0)::int AS on_hand, coalesce(i.reserved, 0)::int AS reserved,
            coalesce(
              (SELECT im.url FROM product_images im WHERE im.product_id = p.id ORDER BY im.sort_order LIMIT 1),
              nullif((SELECT c.image_url FROM categories c WHERE c.id = p.category_id), '')
            ) AS cover_url
     ${where}
     ORDER BY ${SORTS[search.sort]}
     LIMIT $7 OFFSET $8`,
    [...params, pageSize, (page - 1) * pageSize],
  )) as {
    id: string;
    sku: string;
    options: Record<string, string> | null;
    active: boolean;
    legacy_id: string;
    name: string;
    option_names: string[] | null;
    low_stock_threshold: number | null;
    on_hand: number;
    reserved: number;
    cover_url: string | null;
  }[];

  return {
    items: rows.map((row) => {
      const onHand = Number(row.on_hand);
      const reserved = Number(row.reserved);
      return {
        variantId: row.id,
        sku: row.sku,
        optionsLabel: variantOptionsLabel(row.option_names ?? [], row.options ?? {}),
        active: row.active,
        productId: row.legacy_id,
        productName: row.name,
        coverUrl: row.cover_url || FALLBACK_COVER,
        onHand,
        reserved,
        available: onHand - reserved,
        lowStockThreshold: row.low_stock_threshold,
        state: productStockState({ trackStock: true, onHand, reserved, lowStockThreshold: row.low_stock_threshold }),
      };
    }),
    total,
    page,
    pageSize,
    pages,
  };
}
