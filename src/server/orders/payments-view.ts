import type { QueryFn } from "../db/client.ts";

/** One Mercado Pago payment attempt of an order, as last reported (read-only view of `payments`). */
export type OrderPayment = {
  externalId: string;
  status: string;
  statusDetail: string;
  amountMinor: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PaymentRow = {
  external_id: string;
  status: string;
  status_detail: string;
  amount_minor: string | number;
  currency: string;
  created_at: Date | string;
  updated_at: Date | string;
};

/** The Mercado Pago payments of one order, newest first. Never writes. */
export async function listOrderPayments(sql: QueryFn, orderId: string): Promise<OrderPayment[]> {
  if (!UUID.test(orderId)) return [];
  const rows = (await sql.query(
    `SELECT external_id, status, status_detail, amount_minor, currency, created_at, updated_at
     FROM payments WHERE order_id = $1 ORDER BY created_at DESC, external_id DESC`,
    [orderId],
  )) as PaymentRow[];
  return rows.map((row) => ({
    externalId: row.external_id,
    status: row.status,
    statusDetail: row.status_detail,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}
