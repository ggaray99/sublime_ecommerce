import { randomBytes } from "node:crypto";
import type { QueryFn } from "../customers/repository.ts";

/** Minutes a checkout holds stock while the payment is arranged. */
export const RESERVATION_MINUTES = 15;

export const ORDER_STATUSES = ["pending_payment", "paid", "shipped", "fulfilled", "cancelled", "expired", "needs_review"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type Delivery =
  | { method: "pickup" }
  | {
      method: "shipping";
      address: { recipient: string; street: string; streetNumber: string; apartment: string; city: string; province: string; postalCode: string; notes: string };
    };

/** Shipping quote frozen at checkout. */
export type ShippingSnapshot = {
  method: "pickup" | "shipping";
  costMinor: number;
  label: string;
  ruleId: string | null;
  free: boolean;
  etaMinDays: number | null;
  etaMaxDays: number | null;
};

export type Tracking = { carrier: string; code: string; url: string };

export type OrderItem = { sku: string; productId: string; name: string; options: Record<string, string>; quantity: number; unitPriceMinor: number; lineTotalMinor: number };
export type OrderEvent = { fromStatus: string | null; toStatus: string; actor: string; note: string; createdAt: Date };

export type Order = {
  id: string;
  number: number;
  accessToken: string;
  customerId: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  delivery: Delivery;
  status: OrderStatus;
  subtotalMinor: number;
  shippingMinor: number | null;
  shipping: ShippingSnapshot | null;
  tracking: Tracking | null;
  shippedAt: Date | null;
  notes: string;
  expiresAt: Date;
  createdAt: Date;
};

export type OrderDetail = Order & { items: OrderItem[]; events: OrderEvent[] };

export type NewOrder = {
  idempotencyKey: string;
  customerId: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  delivery: Delivery;
  notes: string;
  /** Shipping quoted by the server (rules in 0009). */
  shipping: ShippingSnapshot;
  /** Lines already priced by the server quote (never by the browser). */
  lines: { sku: string; productId: string; name: string; quantity: number; unitPriceMinor: number }[];
};

type OrderErrorCode = "not_found" | "invalid_transition" | "insufficient_stock" | "duplicate";

export class OrderError extends Error {
  readonly code: OrderErrorCode;

  constructor(code: OrderErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

type OrderRow = {
  id: string;
  number: string | number;
  access_token: string;
  customer_id: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  delivery: Delivery;
  status: OrderStatus;
  subtotal_minor: string | number;
  shipping_minor: string | number | null;
  shipping: ShippingSnapshot | null;
  tracking: Tracking | null;
  shipped_at: Date | null;
  notes: string;
  expires_at: Date;
  created_at: Date;
};

const toOrder = (row: OrderRow): Order => ({
  id: row.id,
  number: Number(row.number),
  accessToken: row.access_token,
  customerId: row.customer_id,
  contactName: row.contact_name,
  contactEmail: row.contact_email,
  contactPhone: row.contact_phone,
  delivery: row.delivery,
  status: row.status,
  subtotalMinor: Number(row.subtotal_minor),
  shippingMinor: row.shipping_minor === null ? null : Number(row.shipping_minor),
  shipping: row.shipping,
  tracking: row.tracking,
  shippedAt: row.shipped_at ? new Date(row.shipped_at) : null,
  notes: row.notes,
  expiresAt: new Date(row.expires_at),
  createdAt: new Date(row.created_at),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pgCode = (error: unknown) => (error as { code?: string } | null)?.code;
const pgConstraint = (error: unknown) => (error as { constraint?: string } | null)?.constraint ?? "";

/** Display number: SUB-1001. */
export const orderNumber = (order: Pick<Order, "number">) => `SUB-${order.number}`;

const event = (actor: string, from: string, to: string, note: string) =>
  `INSERT INTO order_events (order_id, from_status, to_status, actor, note) SELECT id, '${from}', '${to}', ${actor}, ${note}`;

/**
 * Orders and their stock reservations. Every transition is one SQL statement,
 * so reservations, inventory, movements, order status and history change
 * together or not at all.
 */
export function createOrderRepository(sql: QueryFn) {
  async function getOrder(id: string): Promise<OrderDetail> {
    if (!UUID.test(id)) throw new OrderError("not_found", "El pedido no existe.");
    const [row] = (await sql.query("SELECT * FROM orders WHERE id = $1", [id])) as OrderRow[];
    if (!row) throw new OrderError("not_found", "El pedido no existe.");
    const [items, events] = await Promise.all([
      sql.query(
        `SELECT sku, product_legacy_id, name, options, quantity, unit_price_minor, line_total_minor
         FROM order_items WHERE order_id = $1 ORDER BY id`,
        [id],
      ) as Promise<{ sku: string; product_legacy_id: string; name: string; options: Record<string, string>; quantity: number; unit_price_minor: string | number; line_total_minor: string | number }[]>,
      sql.query("SELECT from_status, to_status, actor, note, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at, id", [id]) as Promise<
        { from_status: string | null; to_status: string; actor: string; note: string; created_at: Date }[]
      >,
    ]);
    return {
      ...toOrder(row),
      items: items.map((item) => ({
        sku: item.sku,
        productId: item.product_legacy_id,
        name: item.name,
        options: item.options,
        quantity: item.quantity,
        unitPriceMinor: Number(item.unit_price_minor),
        lineTotalMinor: Number(item.line_total_minor),
      })),
      events: events.map((entry) => ({
        fromStatus: entry.from_status,
        toStatus: entry.to_status,
        actor: entry.actor,
        note: entry.note,
        createdAt: new Date(entry.created_at),
      })),
    };
  }

  async function findByIdempotencyKey(key: string): Promise<Order | null> {
    const [row] = (await sql.query("SELECT * FROM orders WHERE idempotency_key = $1", [key])) as OrderRow[];
    return row ? toOrder(row) : null;
  }

  async function transition(id: string, query: string, params: unknown[], invalid: string) {
    const [row] = (await sql.query(query, params)) as { id: string }[];
    if (!row) {
      await getOrder(id); // not_found when it does not exist
      throw new OrderError("invalid_transition", invalid);
    }
  }

  return {
    getOrder,
    findByIdempotencyKey,

    /** The guest confirmation page needs the order id and its secret token. */
    async getOrderByToken(id: string, token: string): Promise<OrderDetail | null> {
      const order = await getOrder(id).catch(() => null);
      return order && token && order.accessToken === token ? order : null;
    },

    async listOrders(filter: { status?: OrderStatus; customerId?: string; limit?: number } = {}): Promise<Order[]> {
      const rows = (await sql.query(
        `SELECT * FROM orders
         WHERE ($1::text IS NULL OR status = $1) AND ($2::uuid IS NULL OR customer_id = $2)
         ORDER BY created_at DESC LIMIT $3`,
        [filter.status ?? null, filter.customerId ?? null, filter.limit ?? 100],
      )) as OrderRow[];
      return rows.map(toOrder);
    },

    async countByStatus(): Promise<Record<OrderStatus, number>> {
      const rows = (await sql.query("SELECT status, count(*)::int AS n FROM orders GROUP BY status")) as { status: OrderStatus; n: number }[];
      return Object.fromEntries(ORDER_STATUSES.map((status) => [status, rows.find((row) => row.status === status)?.n ?? 0])) as Record<OrderStatus, number>;
    },

    /**
     * Creates the order, its frozen items and the stock reservations in one
     * statement. Reserving more than is available violates inventory's
     * reserved <= on_hand check, so the whole order fails: no overselling, even
     * with simultaneous checkouts. A repeated idempotency key returns the first order.
     */
    async placeOrder(input: NewOrder): Promise<Order> {
      const existing = await findByIdempotencyKey(input.idempotencyKey);
      if (existing) return existing;
      const lines = input.lines.map((line) => ({
        sku: line.sku,
        product_id: line.productId,
        name: line.name,
        qty: line.quantity,
        unit_price: line.unitPriceMinor,
      }));
      const subtotal = input.lines.reduce((total, line) => total + line.unitPriceMinor * line.quantity, 0);
      try {
        const [row] = (await sql.query(
          `WITH req AS (
             SELECT r.*, v.id AS variant_id, v.options, v.track_stock
             FROM jsonb_to_recordset($1::jsonb) AS r(sku text, product_id text, name text, qty int, unit_price bigint)
             JOIN product_variants v ON v.sku = r.sku
           ),
           -- Every data-modifying step runs: reserve only when the whole order will be created.
           reserve AS (
             UPDATE inventory i SET reserved = i.reserved + req.qty, updated_at = now()
             FROM req WHERE i.variant_id = req.variant_id AND req.track_stock AND (SELECT count(*) FROM req) = $12
             RETURNING i.variant_id
           ),
           -- A tracked variant without an inventory row has no stock: inserting (0 on hand, N
           -- reserved) violates reserved <= on_hand on purpose, so the order fails as out of stock.
           uncounted AS (
             INSERT INTO inventory (variant_id, on_hand, reserved)
             SELECT req.variant_id, 0, req.qty FROM req
             WHERE req.track_stock AND NOT EXISTS (SELECT 1 FROM inventory i WHERE i.variant_id = req.variant_id)
             RETURNING variant_id
           ),
           created AS (
             INSERT INTO orders (access_token, customer_id, contact_name, contact_email, contact_phone, delivery, notes,
                                 subtotal_minor, idempotency_key, expires_at, shipping_minor, shipping)
             SELECT $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, now() + make_interval(mins => $11), $13, $14::jsonb
             WHERE (SELECT count(*) FROM req) = $12
             RETURNING *
           ),
           items AS (
             INSERT INTO order_items (order_id, variant_id, product_legacy_id, sku, name, options, quantity, unit_price_minor, line_total_minor)
             SELECT created.id, req.variant_id, req.product_id, req.sku, req.name, req.options, req.qty, req.unit_price, req.unit_price * req.qty
             FROM created, req
           ),
           holds AS (
             INSERT INTO stock_reservations (variant_id, quantity, expires_at, idempotency_key, order_id)
             SELECT req.variant_id, req.qty, created.expires_at, created.id || ':' || req.sku, created.id
             FROM created, req WHERE req.track_stock
             RETURNING id, variant_id, quantity
           ),
           moved AS (
             INSERT INTO inventory_movements (variant_id, delta_reserved, reason, reservation_id, actor, note)
             SELECT holds.variant_id, holds.quantity, 'reservation_created', holds.id, 'checkout', 'Pedido SUB-' || created.number
             FROM holds, created
           ),
           history AS (
             INSERT INTO order_events (order_id, from_status, to_status, actor, note)
             SELECT id, NULL, 'pending_payment', 'checkout', 'Pedido creado; stock reservado por ' || $11 || ' minutos.' FROM created
           )
           SELECT * FROM created`,
          [
            JSON.stringify(lines),
            randomBytes(24).toString("base64url"),
            input.customerId,
            input.contactName,
            input.contactEmail,
            input.contactPhone,
            JSON.stringify(input.delivery),
            input.notes,
            subtotal,
            input.idempotencyKey,
            RESERVATION_MINUTES,
            lines.length,
            input.shipping.costMinor,
            JSON.stringify(input.shipping),
          ],
        )) as OrderRow[];
        // A SKU that disappeared between the quote and the order: nothing was written.
        if (!row) throw new OrderError("insufficient_stock", "Un producto dejó de estar disponible. Revisá el carrito.");
        return toOrder(row);
      } catch (error) {
        if (pgCode(error) === "23514" && pgConstraint(error).startsWith("inventory")) {
          throw new OrderError("insufficient_stock", "Mientras completabas el pedido se agotó el stock de algún producto. Revisá el carrito.");
        }
        if (pgCode(error) === "23505" && pgConstraint(error).includes("idempotency")) {
          // The same submit arrived twice at the same time: return the order that won.
          const first = await findByIdempotencyKey(input.idempotencyKey);
          if (first) return first;
        }
        throw error;
      }
    },

    /**
     * Releases reservations whose time ran out and expires their unpaid orders.
     * Called before reading availability and from the admin, so expiry does not
     * depend on a scheduled job. Safe to run concurrently.
     */
    async releaseExpired(): Promise<{ reservations: number; orders: number }> {
      const [row] = (await sql.query(
        `WITH due AS (
           UPDATE stock_reservations SET status = 'expired', resolved_at = now()
           WHERE status = 'active' AND expires_at < now()
           RETURNING id, variant_id, quantity, order_id
         ),
         per_variant AS (SELECT variant_id, sum(quantity)::int AS quantity FROM due GROUP BY variant_id),
         released AS (
           UPDATE inventory i SET reserved = i.reserved - pv.quantity, updated_at = now()
           FROM per_variant pv WHERE i.variant_id = pv.variant_id RETURNING i.variant_id
         ),
         moved AS (
           INSERT INTO inventory_movements (variant_id, delta_reserved, reason, reservation_id, actor, note)
           SELECT variant_id, -quantity, 'reservation_expired', id, 'system', 'Reserva vencida' FROM due
         ),
         expired AS (
           UPDATE orders SET status = 'expired', updated_at = now()
           WHERE status = 'pending_payment' AND id IN (SELECT order_id FROM due) RETURNING id
         ),
         history AS (
           ${event("'system'", "pending_payment", "expired", `'Venció la reserva de stock sin pago confirmado.'`)} FROM expired
         )
         SELECT (SELECT count(*) FROM due)::int AS reservations, (SELECT count(*) FROM expired)::int AS orders`,
      )) as { reservations: number; orders: number }[];
      return row;
    },

    /**
     * Payment received. In time: the reservation becomes a sale. Late (the order
     * expired): stock is taken only if still available; otherwise the order goes
     * to needs_review for a manual decision (restock, delay or refund), and stock
     * already promised to others is never touched.
     */
    async confirmPayment(actor: string, id: string, note = ""): Promise<OrderStatus> {
      const order = await getOrder(id);
      if (order.status === "pending_payment") {
        await transition(
          id,
          `WITH open_order AS (SELECT id FROM orders WHERE id = $1 AND status = 'pending_payment'),
           sold AS (
             UPDATE stock_reservations SET status = 'converted', resolved_at = now()
             WHERE order_id = (SELECT id FROM open_order) AND status = 'active'
             RETURNING id, variant_id, quantity
           ),
           per_variant AS (SELECT variant_id, sum(quantity)::int AS quantity FROM sold GROUP BY variant_id),
           stock AS (
             UPDATE inventory i SET on_hand = i.on_hand - pv.quantity, reserved = i.reserved - pv.quantity, updated_at = now()
             FROM per_variant pv WHERE i.variant_id = pv.variant_id RETURNING i.variant_id
           ),
           moved AS (
             INSERT INTO inventory_movements (variant_id, delta_on_hand, delta_reserved, reason, reservation_id, actor, note)
             SELECT variant_id, -quantity, -quantity, 'sale', id, $2, 'Venta confirmada' FROM sold
           ),
           paid AS (UPDATE orders SET status = 'paid', updated_at = now() WHERE id = (SELECT id FROM open_order) RETURNING id),
           history AS (${event("$2", "pending_payment", "paid", "$3")} FROM paid)
           SELECT id FROM paid`,
          [id, actor, note || "Pago confirmado."],
          "El pedido ya no está pendiente de pago.",
        );
        return "paid";
      }
      if (order.status === "expired") {
        try {
          await transition(
            id,
            `WITH late AS (SELECT id FROM orders WHERE id = $1 AND status = 'expired'),
             wanted AS (
               SELECT oi.variant_id, sum(oi.quantity)::int AS quantity
               FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id AND v.track_stock
               WHERE oi.order_id = (SELECT id FROM late) GROUP BY oi.variant_id
             ),
             stock AS (
               UPDATE inventory i SET on_hand = i.on_hand - w.quantity, updated_at = now()
               FROM wanted w WHERE i.variant_id = w.variant_id RETURNING i.variant_id
             ),
             moved AS (
               INSERT INTO inventory_movements (variant_id, delta_on_hand, reason, actor, note)
               SELECT variant_id, -quantity, 'sale', $2, 'Venta con pago tardío' FROM wanted
             ),
             paid AS (UPDATE orders SET status = 'paid', updated_at = now() WHERE id = (SELECT id FROM late) RETURNING id),
             history AS (${event("$2", "expired", "paid", "$3")} FROM paid)
             SELECT id FROM paid`,
            [id, actor, `Pago tardío confirmado; había stock disponible. ${note}`.trim()],
            "El pedido ya no está vencido.",
          );
          return "paid";
        } catch (error) {
          if (pgCode(error) !== "23514") throw error;
          await transition(
            id,
            `WITH review AS (UPDATE orders SET status = 'needs_review', updated_at = now() WHERE id = $1 AND status = 'expired' RETURNING id)
             ${event("$2", "expired", "needs_review", "$3")} FROM review RETURNING order_id AS id`,
            [id, actor, `Pago tardío sin stock suficiente: definir reposición, demora o devolución. ${note}`.trim()],
            "El pedido ya no está vencido.",
          );
          return "needs_review";
        }
      }
      throw new OrderError("invalid_transition", "Solo se confirma el pago de pedidos pendientes o vencidos.");
    },

    /** Cancels an unpaid order and releases its reserved stock. */
    async cancelOrder(actor: string, id: string, note: string): Promise<void> {
      const order = await getOrder(id);
      await transition(
        id,
        `WITH target AS (
           SELECT id, status FROM orders WHERE id = $1 AND status IN ('pending_payment', 'expired', 'needs_review')
         ),
         freed AS (
           UPDATE stock_reservations SET status = 'released', resolved_at = now()
           WHERE order_id = (SELECT id FROM target) AND status = 'active'
           RETURNING id, variant_id, quantity
         ),
         per_variant AS (SELECT variant_id, sum(quantity)::int AS quantity FROM freed GROUP BY variant_id),
         stock AS (
           UPDATE inventory i SET reserved = i.reserved - pv.quantity, updated_at = now()
           FROM per_variant pv WHERE i.variant_id = pv.variant_id RETURNING i.variant_id
         ),
         moved AS (
           INSERT INTO inventory_movements (variant_id, delta_reserved, reason, reservation_id, actor, note)
           SELECT variant_id, -quantity, 'reservation_released', id, $2, 'Pedido cancelado' FROM freed
         ),
         cancelled AS (UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = (SELECT id FROM target) RETURNING id),
         history AS (${event("$2", order.status, "cancelled", "$3")} FROM cancelled)
         SELECT id FROM cancelled`,
        [id, actor, note || "Pedido cancelado."],
        "Solo se cancelan pedidos sin pago confirmado (los pagados requieren una devolución).",
      );
    },

    /** Paid shipping orders go out with their tracking (carrier, code and an optional link). */
    async markShipped(actor: string, id: string, tracking: Tracking, note: string): Promise<void> {
      await transition(
        id,
        `WITH sent AS (
           UPDATE orders SET status = 'shipped', tracking = $4::jsonb, shipped_at = now(), updated_at = now()
           WHERE id = $1 AND status = 'paid' AND delivery ->> 'method' = 'shipping' RETURNING id
         )
         ${event("$2", "paid", "shipped", "$3")} FROM sent RETURNING order_id AS id`,
        [id, actor, note || `Enviado por ${tracking.carrier}${tracking.code ? ` (${tracking.code})` : ""}.`, JSON.stringify(tracking)],
        "Solo se envían pedidos pagados con envío a domicilio.",
      );
    },

    /** Delivered: pickups straight from paid, shipments once shipped. */
    async markFulfilled(actor: string, id: string, note: string): Promise<void> {
      const order = await getOrder(id);
      await transition(
        id,
        `WITH done AS (
           UPDATE orders SET status = 'fulfilled', updated_at = now()
           WHERE id = $1 AND (status = 'shipped' OR (status = 'paid' AND delivery ->> 'method' = 'pickup')) RETURNING id
         )
         ${event("$2", order.status, "fulfilled", "$3")} FROM done RETURNING order_id AS id`,
        [id, actor, note || (order.delivery.method === "pickup" ? "Retirado en el taller." : "Pedido entregado.")],
        order.delivery.method === "shipping" && order.status === "paid"
          ? "Primero marcá el pedido como enviado (con el seguimiento)."
          : "Solo se entregan pedidos pagados o enviados.",
      );
    },
  };
}

export type OrderRepository = ReturnType<typeof createOrderRepository>;
