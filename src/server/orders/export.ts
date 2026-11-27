import type { QueryFn } from "../customers/repository.ts";
import { formatCsv, pesosCell } from "../../lib/csv.ts";
import { orderNumber, orderTotalMinor, type Delivery, type OrderStatus } from "./repository.ts";

export const ORDER_CSV_COLUMNS = ["pedido", "fecha", "cliente", "email", "entrega", "estado", "pago_elegido", "items", "subtotal", "envio", "descuento", "total"] as const;

const PAYMENT_LABEL: Record<string, string> = { any: "Cualquier medio", transfer: "Transferencia o efectivo" };

/** Argentina has no DST: UTC−3 all year (same as the panel's dates). */
export const argentinaDateTime = (date: Date) => {
  const [day, time] = new Date(date.getTime() - 3 * 3600_000).toISOString().split("T");
  return `${day.split("-").reverse().join("/")} ${time.slice(0, 5)}`;
};

type Row = {
  id: string;
  number: string | number;
  created_at: Date;
  contact_name: string;
  contact_email: string;
  delivery: Delivery;
  status: OrderStatus;
  payment_preference: string | null;
  subtotal_minor: string | number;
  discount_minor: string | number | null;
  shipping_minor: string | number | null;
};

/**
 * The selected orders as a spreadsheet, newest first; unknown ids are skipped.
 * Customer-typed text is neutralized so a name like "=…" never runs as a formula.
 * `statusLabel` is the panel's own wording (src/components/orders/order-view.tsx).
 */
export async function exportOrdersCsv(sql: QueryFn, ids: string[], statusLabel: Record<OrderStatus, string>): Promise<string> {
  const [orders, items] = (await Promise.all([
    sql.query(
      `SELECT id, number, created_at, contact_name, contact_email, delivery, status, payment_preference, subtotal_minor, discount_minor, shipping_minor
       FROM orders WHERE id = ANY ($1::uuid[]) ORDER BY created_at DESC, number DESC`,
      [ids],
    ),
    sql.query("SELECT order_id, name, quantity FROM order_items WHERE order_id = ANY ($1::uuid[]) ORDER BY id", [ids]),
  ])) as [Row[], { order_id: string; name: string; quantity: number }[]];
  const linesOf = new Map<string, string[]>();
  for (const item of items) linesOf.set(item.order_id, [...(linesOf.get(item.order_id) ?? []), `${item.quantity} × ${item.name}`]);
  const rows = orders.map((row) => {
    const amounts = {
      subtotalMinor: Number(row.subtotal_minor),
      discountMinor: Number(row.discount_minor ?? 0),
      shippingMinor: row.shipping_minor === null ? null : Number(row.shipping_minor),
    };
    return [
      orderNumber({ number: Number(row.number) }),
      argentinaDateTime(new Date(row.created_at)),
      row.contact_name,
      row.contact_email,
      row.delivery.method === "shipping" ? `Envío · ${row.delivery.address.city}` : "Retiro",
      statusLabel[row.status] ?? row.status,
      PAYMENT_LABEL[row.payment_preference ?? "any"] ?? "",
      (linesOf.get(row.id) ?? []).join(" | "),
      pesosCell(amounts.subtotalMinor),
      pesosCell(amounts.shippingMinor),
      pesosCell(amounts.discountMinor),
      pesosCell(orderTotalMinor(amounts)),
    ];
  });
  return formatCsv(ORDER_CSV_COLUMNS, rows, { neutralizeFormulas: true });
}
