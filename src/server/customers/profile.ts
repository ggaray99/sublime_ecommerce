import type { QueryFn } from "../db/client.ts";

/*
 * Read-only queries of the admin customer profile. Ownership is customer_id
 * (the account that was signed in); guest records that share the email are
 * listed apart and are never linked, merged or counted.
 */

export type CustomerActivityEvent = {
  kind: "order" | "request";
  /** orders.id or custom_requests.id. */
  recordId: string;
  number: number;
  toStatus: string;
  actor: string;
  note: string;
  /** Delivery method of an order event; null for encargos. */
  method: "shipping" | "pickup" | null;
  createdAt: Date;
};

type ActivityRow = {
  kind: "order" | "request";
  record_id: string;
  number: number | string;
  to_status: string;
  actor: string;
  note: string;
  method: "shipping" | "pickup" | null;
  created_at: Date | string;
};

const clampLimit = (limit: number, max: number) => Math.min(Math.max(Math.trunc(limit) || 1, 1), max);

/** Latest status changes of the customer's orders and encargos, newest first. */
export async function customerActivity(sql: QueryFn, customerId: string, limit = 15): Promise<CustomerActivityEvent[]> {
  const rows = (await sql.query(
    `SELECT * FROM (
       SELECT 'order' AS kind, o.id::text AS record_id, o.number, e.to_status, e.actor, e.note, o.delivery->>'method' AS method, e.created_at, e.id AS event_id
       FROM order_events e JOIN orders o ON o.id = e.order_id
       WHERE o.customer_id = $1::uuid
       UNION ALL
       SELECT 'request', r.id::text, r.number, e.to_status, e.actor, e.note, NULL, e.created_at, e.id
       FROM custom_request_events e JOIN custom_requests r ON r.id = e.request_id
       WHERE r.customer_id = $1::uuid
     ) activity
     ORDER BY created_at DESC, event_id DESC
     LIMIT $2`,
    [customerId, clampLimit(limit, 100)],
  )) as ActivityRow[];
  return rows.map((row) => ({
    kind: row.kind,
    recordId: row.record_id,
    number: Number(row.number),
    toStatus: row.to_status,
    actor: row.actor,
    note: row.note,
    method: row.method,
    createdAt: new Date(row.created_at),
  }));
}

export type GuestOrderMatch = { id: string; number: number; status: string; createdAt: Date; totalMinor: number; contactName: string; contactEmail: string };
export type GuestRequestMatch = {
  id: string;
  number: number;
  status: string;
  createdAt: Date;
  productType: string;
  quantity: number;
  contactName: string;
  contactEmail: string;
};

/** Guest orders and encargos (customer_id NULL) typed with the same email, any case. Read-only. */
export async function guestMatches(sql: QueryFn, email: string, limit = 20): Promise<{ orders: GuestOrderMatch[]; requests: GuestRequestMatch[] }> {
  const params = [email.trim(), clampLimit(limit, 100)];
  const [orders, requests] = await Promise.all([
    sql.query(
      `SELECT id::text, number, status, created_at, subtotal_minor - discount_minor + COALESCE(shipping_minor, 0) AS total_minor, contact_name, contact_email
       FROM orders WHERE customer_id IS NULL AND lower(contact_email) = lower($1)
       ORDER BY created_at DESC, id LIMIT $2`,
      params,
    ) as Promise<{ id: string; number: number | string; status: string; created_at: Date | string; total_minor: number | string; contact_name: string; contact_email: string }[]>,
    sql.query(
      `SELECT id::text, number, status, created_at, product_type, quantity, contact_name, contact_email
       FROM custom_requests WHERE customer_id IS NULL AND lower(contact_email) = lower($1)
       ORDER BY created_at DESC, id LIMIT $2`,
      params,
    ) as Promise<{ id: string; number: number | string; status: string; created_at: Date | string; product_type: string; quantity: number; contact_name: string; contact_email: string }[]>,
  ]);
  return {
    orders: orders.map((row) => ({
      id: row.id,
      number: Number(row.number),
      status: row.status,
      createdAt: new Date(row.created_at),
      totalMinor: Number(row.total_minor),
      contactName: row.contact_name,
      contactEmail: row.contact_email,
    })),
    requests: requests.map((row) => ({
      id: row.id,
      number: Number(row.number),
      status: row.status,
      createdAt: new Date(row.created_at),
      productType: row.product_type,
      quantity: Number(row.quantity),
      contactName: row.contact_name,
      contactEmail: row.contact_email,
    })),
  };
}

/** The customer's needs_review orders: paid after the reservation expired; shown apart from "Total pagado". */
export async function reviewOrderCount(sql: QueryFn, customerId: string): Promise<number> {
  const [row] = (await sql.query("SELECT count(*)::int AS n FROM orders WHERE customer_id = $1::uuid AND status = 'needs_review'", [customerId])) as { n: number }[];
  return Number(row?.n ?? 0);
}
