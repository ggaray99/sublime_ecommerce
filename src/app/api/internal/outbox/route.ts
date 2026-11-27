import { timingSafeEqual } from "node:crypto";
import { getSql, hasDatabase } from "@/server/db/client";
import { createOutboxRepository, processOutbox, webhookDeliver } from "@/server/notifications/outbox";
import { runScheduledExpiry } from "@/server/inventory/scheduled-expiry";
import { enqueueLowStock } from "@/server/notifications/stock-alerts";
import { getOrderRepository, ordersAvailable } from "@/server/orders/session";
import { sellerAccessToken } from "@/server/payments/accounts";
import { reconcilePendingPayments } from "@/server/payments/reconcile";
import { getMercadoPago } from "@/server/payments/session";
import { createPaymentRepository } from "@/server/payments/webhook";
import { CATALOG_TAG } from "@/server/storefront";
import { revalidateTag } from "next/cache";

const notFound = () => new Response("No encontrado", { status: 404 });

/** Constant-time token check: the route only answers the VPS cron. */
function authorized(request: Request): boolean {
  const expected = process.env.OUTBOX_TOKEN;
  if (!expected || expected.length < 32) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Releases expired reservations and delivers pending notifications (called every minute by the VPS cron). */
export async function POST(request: Request) {
  if (!hasDatabase() || !authorized(request)) return notFound();
  // Expired reservations first, so the stock below and in the store is current
  // (docs/inventory-stabilization.md, 7). The result goes to the cron log.
  const expiry = ordersAvailable() ? await runScheduledExpiry(getOrderRepository()) : null;
  if (expiry && "error" in expiry) console.error("[inventory] scheduled expiry failed", expiry.error);
  if (expiry && "orders" in expiry && expiry.reservations > 0) revalidateTag(CATALOG_TAG, { expire: 0 });
  // Low stock is checked here too, so one cron covers it.
  const lowStock = await enqueueLowStock(getSql());
  const repo = createOutboxRepository(getSql());
  const url = process.env.NOTIFY_WEBHOOK_URL;
  const result = await processOutbox(repo, url ? webhookDeliver(url) : null);
  const payments = await checkPendingPayments();
  return Response.json({ ...result, expiry, lowStock, payments, counts: await repo.counts() }, { headers: { "Cache-Control": "no-store" } });
}

/** Mercado Pago checkouts whose notice was lost: same cron. Never breaks the outbox run. */
async function checkPendingPayments() {
  const mercadoPago = getMercadoPago();
  if (!mercadoPago || !ordersAvailable()) return null;
  try {
    const token = await sellerAccessToken(mercadoPago.accounts, mercadoPago.client, mercadoPago.config.serverAccessToken);
    if (!token) return null;
    const summary = await reconcilePendingPayments({
      getOrder: (id) => mercadoPago.client.getOrder(token, id),
      orders: getOrderRepository(),
      payments: createPaymentRepository(getSql()),
    });
    // A confirmed sale changes stock shown in the store.
    if (summary.confirmed > 0) revalidateTag(CATALOG_TAG, { expire: 0 });
    return summary;
  } catch (error) {
    console.error("[mercadopago] periodic check failed", error instanceof Error ? error.message : "unknown error");
    return { error: true };
  }
}
