import type { QueryFn } from "../customers/repository.ts";
import { MOVEMENT_KINDS, movementKind, type MovementKind } from "./movement-view.ts";

export const MOVEMENTS_PAGE_SIZE = 50;

export type InventoryMovement = {
  id: string;
  createdAt: Date;
  variantId: string;
  sku: string;
  options: Record<string, string>;
  productId: string;
  productName: string;
  reason: string;
  kind: MovementKind;
  deltaOnHand: number;
  deltaReserved: number;
  actor: string;
  note: string;
  /** The order behind a reservation or an on-time sale (late-payment sales have no reservation). */
  order: { id: string; number: number } | null;
};

export type MovementSearch = {
  productId?: string;
  variantId?: string;
  /** MOVEMENT_KINDS value: entradas, salidas, ajustes, reservas. */
  kind?: string;
  /** SKU or product name. */
  q?: string;
  /** Argentina dates, YYYY-MM-DD, inclusive. */
  desde?: string;
  hasta?: string;
  page?: number;
  pageSize?: number;
};

export type MovementPage = { items: InventoryMovement[]; total: number; page: number; pageSize: number; pages: number };

const PRODUCT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Start of an Argentina day (UTC−3, no DST) as an instant. */
const dayStart = (day: string) => `${day}T00:00:00-03:00`;

/**
 * The ledger, newest first, read-only: inventory_movements with the variant,
 * the product and, through stock_reservations, the order. Unknown filter values
 * select nothing instead of failing.
 */
export async function listInventoryMovements(sql: QueryFn, search: MovementSearch): Promise<MovementPage> {
  const pageSize = Math.min(Math.max(search.pageSize ?? MOVEMENTS_PAGE_SIZE, 1), 200);
  if (search.productId !== undefined && !PRODUCT_ID.test(search.productId)) return { items: [], total: 0, page: 1, pageSize, pages: 1 };
  if (search.variantId !== undefined && !UUID.test(search.variantId)) return { items: [], total: 0, page: 1, pageSize, pages: 1 };
  const reasons = search.kind ? (MOVEMENT_KINDS.find((kind) => kind.value === search.kind)?.reasons ?? null) : null;
  const text = search.q?.trim() ? `%${search.q.trim().replace(/[\\%_]/g, (char) => `\\${char}`)}%` : null;
  const from = search.desde && DAY.test(search.desde) ? dayStart(search.desde) : null;
  const to = search.hasta && DAY.test(search.hasta) ? dayStart(search.hasta) : null;

  const where = `
    FROM inventory_movements m
    JOIN product_variants v ON v.id = m.variant_id
    JOIN products p ON p.id = v.product_id
    LEFT JOIN stock_reservations r ON r.id = m.reservation_id
    LEFT JOIN orders o ON o.id = r.order_id
    WHERE ($1::text IS NULL OR p.legacy_id = $1)
      AND ($2::uuid IS NULL OR v.id = $2)
      AND ($3::text[] IS NULL OR m.reason = ANY ($3))
      AND ($4::text IS NULL OR v.sku ILIKE $4 ESCAPE '\\' OR p.name ILIKE $4 ESCAPE '\\')
      AND ($5::timestamptz IS NULL OR m.created_at >= $5)
      AND ($6::timestamptz IS NULL OR m.created_at < $6::timestamptz + interval '1 day')`;
  const params = [search.productId ?? null, search.variantId ?? null, reasons, text, from, to];

  const [{ total }] = (await sql.query(`SELECT count(*)::int AS total ${where}`, params)) as { total: number }[];
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Math.trunc(search.page ?? 1) || 1, 1), pages);
  const rows = (await sql.query(
    `SELECT m.id, m.created_at, v.id AS variant_id, v.sku, v.options, p.legacy_id AS product_id, p.name AS product_name,
            m.reason, m.delta_on_hand, m.delta_reserved, m.actor, m.note, o.id AS order_id, o.number AS order_number
     ${where}
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $7 OFFSET $8`,
    [...params, pageSize, (page - 1) * pageSize],
  )) as {
    id: string | number;
    created_at: Date;
    variant_id: string;
    sku: string;
    options: Record<string, string> | null;
    product_id: string;
    product_name: string;
    reason: string;
    delta_on_hand: number;
    delta_reserved: number;
    actor: string;
    note: string;
    order_id: string | null;
    order_number: string | number | null;
  }[];

  return {
    items: rows.map((row) => ({
      id: String(row.id),
      createdAt: new Date(row.created_at),
      variantId: row.variant_id,
      sku: row.sku,
      options: row.options ?? {},
      productId: row.product_id,
      productName: row.product_name,
      reason: row.reason,
      kind: movementKind(row.reason),
      deltaOnHand: Number(row.delta_on_hand),
      deltaReserved: Number(row.delta_reserved),
      actor: row.actor,
      note: row.note,
      order: row.order_id ? { id: row.order_id, number: Number(row.order_number) } : null,
    })),
    total,
    page,
    pageSize,
    pages,
  };
}
