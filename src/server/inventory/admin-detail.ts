import type { QueryFn } from "../customers/repository.ts";
import type { ProductStatus } from "../admin/validation.ts";

/*
 * Read-only queries of the admin inventory detail (/admin/inventario/[productId]).
 * Same stock rules as the rest of the panel (docs/admin-inventory-audit.md):
 * physical = on_hand, reserved = reserved, available = on_hand − reserved;
 * product totals sum the active variants; track_stock comes from the default
 * variant. Inactive variants are listed too (read-only), never added to totals.
 */

/** "Stock bajo" threshold when the product has none (same as product-search's LOW_STOCK). */
const DEFAULT_THRESHOLD = 5;
const PRODUCT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export type InventoryDetailVariant = {
  id: string;
  sku: string;
  options: Record<string, string>;
  active: boolean;
  isDefault: boolean;
  trackStock: boolean;
  onHand: number;
  reserved: number;
  available: number;
};

export type StockTotals = { onHand: number; reserved: number; available: number };

export type InventoryDetail = {
  id: string;
  name: string;
  status: ProductStatus;
  trackStock: boolean;
  optionNames: string[];
  /** The product's own threshold (null = default). */
  lowStockThreshold: number | null;
  /** The threshold in effect. */
  threshold: number;
  defaultSku: string;
  /** Active first, then by the variants' order (like the product page). */
  variants: InventoryDetailVariant[];
  /** Active variants only. */
  totals: StockTotals;
};

export async function inventoryDetail(sql: QueryFn, productId: string): Promise<InventoryDetail | null> {
  if (!PRODUCT_ID.test(productId)) return null;
  const [product] = (await sql.query(
    `SELECT p.legacy_id, p.name, p.status, p.option_names, p.low_stock_threshold
     FROM products p WHERE p.legacy_id = $1`,
    [productId],
  )) as { legacy_id: string; name: string; status: ProductStatus; option_names: string[] | null; low_stock_threshold: number | null }[];
  if (!product) return null;

  const rows = (await sql.query(
    `SELECT v.id, v.sku, v.options, v.active, v.is_default, v.track_stock, coalesce(i.on_hand, 0) AS on_hand, coalesce(i.reserved, 0) AS reserved
     FROM product_variants v
     JOIN products p ON p.id = v.product_id
     LEFT JOIN inventory i ON i.variant_id = v.id
     WHERE p.legacy_id = $1
     ORDER BY v.active DESC, v.sort_order, v.sku`,
    [productId],
  )) as { id: string; sku: string; options: Record<string, string> | null; active: boolean; is_default: boolean; track_stock: boolean; on_hand: number; reserved: number }[];

  const variants = rows.map((row) => {
    const onHand = Number(row.on_hand);
    const reserved = Number(row.reserved);
    return {
      id: row.id,
      sku: row.sku,
      options: row.options ?? {},
      active: row.active,
      isDefault: row.is_default,
      trackStock: row.track_stock,
      onHand,
      reserved,
      available: onHand - reserved,
    };
  });
  const defaultVariant = variants.find((variant) => variant.isDefault) ?? variants[0];
  const totals = variants
    .filter((variant) => variant.active)
    .reduce((sum, variant) => ({ onHand: sum.onHand + variant.onHand, reserved: sum.reserved + variant.reserved, available: sum.available + variant.available }), {
      onHand: 0,
      reserved: 0,
      available: 0,
    });
  const lowStockThreshold = product.low_stock_threshold === null ? null : Number(product.low_stock_threshold);

  return {
    id: product.legacy_id,
    name: product.name,
    status: product.status,
    trackStock: defaultVariant?.trackStock ?? false,
    optionNames: product.option_names ?? [],
    lowStockThreshold,
    threshold: lowStockThreshold ?? DEFAULT_THRESHOLD,
    defaultSku: defaultVariant?.sku ?? "",
    variants,
    totals,
  };
}

export type ActiveReservation = {
  id: string;
  sku: string;
  options: Record<string, string>;
  quantity: number;
  expiresAt: Date;
  order: { id: string; number: number } | null;
};

/** Reservations still holding stock (status 'active'), soonest expiry first, with their order. */
export async function activeReservations(sql: QueryFn, productId: string): Promise<ActiveReservation[]> {
  if (!PRODUCT_ID.test(productId)) return [];
  const rows = (await sql.query(
    `SELECT r.id, v.sku, v.options, r.quantity, r.expires_at, o.id AS order_id, o.number AS order_number
     FROM stock_reservations r
     JOIN product_variants v ON v.id = r.variant_id
     JOIN products p ON p.id = v.product_id
     LEFT JOIN orders o ON o.id = r.order_id
     WHERE p.legacy_id = $1 AND r.status = 'active'
     ORDER BY r.expires_at, r.id`,
    [productId],
  )) as { id: string; sku: string; options: Record<string, string> | null; quantity: number; expires_at: Date; order_id: string | null; order_number: string | number | null }[];
  return rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    options: row.options ?? {},
    quantity: Number(row.quantity),
    expiresAt: new Date(row.expires_at),
    order: row.order_id ? { id: row.order_id, number: Number(row.order_number) } : null,
  }));
}
