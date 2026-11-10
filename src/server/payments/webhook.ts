import { createHmac, timingSafeEqual } from "node:crypto";
import type { QueryFn } from "../db/client.ts";
import { OrderError, orderTotalMinor, type OrderRepository } from "../orders/repository.ts";
import type { MercadoPagoOrder } from "./mercadopago.ts";

/** Orders API: every transaction processed, i.e. the order is paid. */
const PAID = "processed";
/** Mercado Pago order states that never change into a payment. */
const FINAL = [PAID, "canceled", "expired", "refunded", "charged_back", "not_found"];

/**
 * Mercado Pago's x-signature ("ts=…,v1=…"): HMAC-SHA256 (hex) with the
 * application's webhook secret over "id:<data.id>;request-id:<x-request-id>;ts:<ts>;".
 * Alphanumeric ids (Orders API: "ORD…") go in lowercase per the docs; the id as
 * sent is accepted too, so a casing difference never rejects a genuine notice.
 * A missing value is left out of the template.
 */
export function verifyWebhookSignature(input: { signature: string | null; requestId: string | null; dataId: string | null; secret: string }): boolean {
  const parts = Object.fromEntries(
    (input.signature ?? "").split(",").map((part) => {
      const [name, ...value] = part.split("=");
      return [name.trim(), value.join("=").trim()];
    }),
  );
  const { ts, v1 } = parts as { ts?: string; v1?: string };
  if (!ts || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;

  const received = Buffer.from(v1, "hex");
  const matches = (id: string | null) => {
    const manifest = (id ? `id:${id};` : "") + (input.requestId ? `request-id:${input.requestId};` : "") + `ts:${ts};`;
    return timingSafeEqual(createHmac("sha256", input.secret).update(manifest).digest(), received);
  };
  return matches(input.dataId?.toLowerCase() ?? null) || (input.dataId !== null && input.dataId !== input.dataId.toLowerCase() && matches(input.dataId));
}

/** Last known state of each Mercado Pago order (repeated or out-of-order webhooks just overwrite it). */
export function createPaymentRepository(sql: QueryFn) {
  return {
    async record(payment: MercadoPagoOrder, orderId: string): Promise<void> {
      await sql.query(
        `INSERT INTO payments (provider, external_id, order_id, status, status_detail, amount_minor, currency)
         VALUES ('mercadopago', $1, $2, $3, $4, $5, $6)
         ON CONFLICT (provider, external_id) DO UPDATE SET
           status = EXCLUDED.status, status_detail = EXCLUDED.status_detail, amount_minor = EXCLUDED.amount_minor,
           currency = EXCLUDED.currency, updated_at = now()`,
        [payment.id, orderId, payment.status.slice(0, 40), payment.statusDetail.slice(0, 120), payment.paidAmountMinor, payment.currency.slice(0, 3)],
      );
    },

    /** A checkout just started (status "created"): never overwrites what a notice already reported. */
    async recordStarted(externalId: string, orderId: string): Promise<void> {
      await sql.query(
        `INSERT INTO payments (provider, external_id, order_id, status, amount_minor, currency)
         VALUES ('mercadopago', $1, $2, 'created', 0, '')
         ON CONFLICT (provider, external_id) DO NOTHING`,
        [externalId, orderId],
      );
    },

    /**
     * Checkouts to ask Mercado Pago about because no notice settled them: unfinished,
     * quiet for a few minutes (a notice normally arrives in seconds), started in the
     * last day, and for an order still awaiting payment (an expired one may pay late).
     */
    async awaitingCheck(limit: number): Promise<string[]> {
      const rows = await sql.query(
        `SELECT p.external_id FROM payments p JOIN orders o ON o.id = p.order_id
         WHERE p.provider = 'mercadopago'
           AND p.status NOT IN (${FINAL.map((_, index) => `$${index + 2}`).join(", ")})
           AND o.status IN ('pending_payment', 'expired')
           AND p.updated_at < now() - interval '2 minutes'
           AND p.created_at > now() - interval '24 hours'
         ORDER BY p.updated_at
         LIMIT $1`,
        [limit, ...FINAL],
      );
      return (rows as { external_id: string }[]).map((row) => row.external_id);
    },

    /** A check that failed: waits for the next quiet window; "not_found" stops the checks. */
    async markChecked(externalId: string, status?: "not_found"): Promise<void> {
      await sql.query(
        "UPDATE payments SET status = coalesce($2, status), updated_at = now() WHERE provider = 'mercadopago' AND external_id = $1",
        [externalId, status ?? null],
      );
    },

    /** Another paid Mercado Pago order for the same store order: the customer was charged twice. */
    async hasOtherApproved(orderId: string, paymentId: string): Promise<boolean> {
      const rows = await sql.query(
        "SELECT 1 FROM payments WHERE provider = 'mercadopago' AND order_id = $1 AND external_id <> $2 AND status = $3 LIMIT 1",
        [orderId, paymentId, PAID],
      );
      return rows.length > 0;
    },
  };
}

export type PaymentRepository = ReturnType<typeof createPaymentRepository>;

/**
 * - paid / needs_review: the order moved (needs_review = late payment without stock).
 * - duplicate: already confirmed (repeated webhook or two at once).
 * - recorded: not paid yet (created, action required, failed, expired…): the order waits.
 * - mismatch: paid but the amount or currency differs from the order. Never applied.
 * - conflict: paid for a cancelled or under-review order, or a second paid Mercado Pago
 *   order for an order already paid (double charge): needs a person (refund?).
 * - ignored: the reference is not one of our orders.
 */
export type ReconcileOutcome = "paid" | "needs_review" | "duplicate" | "recorded" | "mismatch" | "conflict" | "ignored";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MERCADOPAGO_ACTOR = "mercadopago";

/** Applies one Mercado Pago order, always fetched from the API (the notification body is never trusted). */
export async function reconcilePayment(
  deps: { getOrder: (id: string) => Promise<MercadoPagoOrder>; orders: OrderRepository; payments: PaymentRepository },
  mercadoPagoOrderId: string,
): Promise<ReconcileOutcome> {
  const payment = await deps.getOrder(mercadoPagoOrderId);
  if (!UUID.test(payment.externalReference)) return "ignored";
  const order = await deps.orders.getOrder(payment.externalReference).catch(() => null);
  if (!order) return "ignored";

  await deps.payments.record(payment, order.id);
  if (payment.status !== PAID) return "recorded";
  if (payment.currency !== "ARS" || payment.paidAmountMinor !== orderTotalMinor(order)) {
    console.error(`[mercadopago] Mercado Pago order ${payment.id} does not match order ${order.id} (amount or currency): not applied`);
    return "mismatch";
  }
  if (order.status !== "pending_payment" && order.status !== "expired") {
    if (order.status === "cancelled" || order.status === "needs_review") {
      console.error(`[mercadopago] paid Mercado Pago order ${payment.id} for ${order.status} order ${order.id}: review and refund if needed`);
      return "conflict";
    }
    if (await deps.payments.hasOtherApproved(order.id, payment.id)) {
      console.error(`[mercadopago] second paid Mercado Pago order ${payment.id} for paid order ${order.id}: refund one of them`);
      return "conflict";
    }
    return "duplicate";
  }
  try {
    return (await deps.orders.confirmPayment(MERCADOPAGO_ACTOR, order.id, `Mercado Pago, pago ${payment.id}.`)) === "paid" ? "paid" : "needs_review";
  } catch (error) {
    // Another notification confirmed it between the read and the update.
    if (error instanceof OrderError && error.code === "invalid_transition") return "duplicate";
    throw error;
  }
}
