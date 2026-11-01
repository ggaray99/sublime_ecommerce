import { createHmac, timingSafeEqual } from "node:crypto";
import type { QueryFn } from "../db/client.ts";
import { OrderError, orderTotalMinor, type OrderRepository } from "../orders/repository.ts";
import type { MercadoPagoPayment } from "./mercadopago.ts";

/**
 * Mercado Pago's x-signature ("ts=…,v1=…"): HMAC-SHA256 (hex) with the
 * application's webhook secret over "id:<data.id>;request-id:<x-request-id>;ts:<ts>;".
 * Alphanumeric ids go in lowercase; a missing value is left out of the template.
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

  const manifest =
    (input.dataId ? `id:${input.dataId.toLowerCase()};` : "") + (input.requestId ? `request-id:${input.requestId};` : "") + `ts:${ts};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(v1, "hex"));
}

/** Last known state of each Mercado Pago payment (repeated or out-of-order webhooks just overwrite it). */
export function createPaymentRepository(sql: QueryFn) {
  return {
    async record(payment: MercadoPagoPayment, orderId: string): Promise<void> {
      await sql.query(
        `INSERT INTO payments (provider, external_id, order_id, status, status_detail, amount_minor, currency, live_mode)
         VALUES ('mercadopago', $1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (provider, external_id) DO UPDATE SET
           status = EXCLUDED.status, status_detail = EXCLUDED.status_detail, amount_minor = EXCLUDED.amount_minor,
           currency = EXCLUDED.currency, updated_at = now()`,
        [payment.id, orderId, payment.status, payment.statusDetail.slice(0, 120), payment.amountMinor, payment.currency, payment.liveMode],
      );
    },

    /** Another approved payment for the same order: the customer was charged twice. */
    async hasOtherApproved(orderId: string, paymentId: string): Promise<boolean> {
      const rows = await sql.query(
        "SELECT 1 FROM payments WHERE provider = 'mercadopago' AND order_id = $1 AND external_id <> $2 AND status = 'approved' LIMIT 1",
        [orderId, paymentId],
      );
      return rows.length > 0;
    },
  };
}

export type PaymentRepository = ReturnType<typeof createPaymentRepository>;

/**
 * - paid / needs_review: the order moved (needs_review = late payment without stock).
 * - duplicate: already confirmed (repeated webhook or two at once).
 * - recorded: not approved yet (pending, in process, rejected…): the order waits.
 * - mismatch: approved but the amount or currency differs from the order. Never applied.
 * - conflict: approved for a cancelled or under-review order, or a second approved payment
 *   for an order already paid (double charge): needs a person (refund?).
 * - ignored: the reference is not one of our orders.
 */
export type ReconcileOutcome = "paid" | "needs_review" | "duplicate" | "recorded" | "mismatch" | "conflict" | "ignored";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MERCADOPAGO_ACTOR = "mercadopago";

/** Applies one Mercado Pago payment, always fetched from the API (the notification body is never trusted). */
export async function reconcilePayment(
  deps: { getPayment: (id: string) => Promise<MercadoPagoPayment>; orders: OrderRepository; payments: PaymentRepository },
  paymentId: string,
): Promise<ReconcileOutcome> {
  const payment = await deps.getPayment(paymentId);
  if (!UUID.test(payment.externalReference)) return "ignored";
  const order = await deps.orders.getOrder(payment.externalReference).catch(() => null);
  if (!order) return "ignored";

  await deps.payments.record(payment, order.id);
  if (payment.status !== "approved") return "recorded";
  if (payment.currency !== "ARS" || payment.amountMinor !== orderTotalMinor(order)) {
    console.error(`[mercadopago] payment ${payment.id} does not match order ${order.id} (amount or currency): not applied`);
    return "mismatch";
  }
  if (order.status !== "pending_payment" && order.status !== "expired") {
    if (order.status === "cancelled" || order.status === "needs_review") {
      console.error(`[mercadopago] approved payment ${payment.id} for ${order.status} order ${order.id}: review and refund if needed`);
      return "conflict";
    }
    if (await deps.payments.hasOtherApproved(order.id, payment.id)) {
      console.error(`[mercadopago] second approved payment ${payment.id} for paid order ${order.id}: refund one of them`);
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
