import type { OrderRepository } from "../orders/repository.ts";
import { MercadoPagoError, type MercadoPagoOrder } from "./mercadopago.ts";
import { reconcilePayment, type PaymentRepository } from "./webhook.ts";

export type PendingCheckSummary = { checked: number; confirmed: number; failed: number };

/**
 * Fallback for lost notices (called by the VPS cron): asks Mercado Pago about
 * started checkouts no notice settled and applies them exactly like the webhook.
 * One failing check never stops the others. "confirmed" counts sales that moved
 * stock (paid or needs_review).
 */
export async function reconcilePendingPayments(
  deps: { getOrder: (id: string) => Promise<MercadoPagoOrder>; orders: OrderRepository; payments: PaymentRepository },
  limit = 10,
): Promise<PendingCheckSummary> {
  const summary: PendingCheckSummary = { checked: 0, confirmed: 0, failed: 0 };
  for (const id of await deps.payments.awaitingCheck(limit)) {
    summary.checked += 1;
    try {
      const outcome = await reconcilePayment(deps, id);
      if (outcome === "paid" || outcome === "needs_review") summary.confirmed += 1;
      if (outcome !== "recorded") console.info(`[mercadopago] periodic check id=${id} → ${outcome}`);
    } catch (error) {
      summary.failed += 1;
      // An order of another account (or deleted) will never resolve: stop asking.
      const missing = error instanceof MercadoPagoError && error.status === 404;
      await deps.payments.markChecked(id, missing ? "not_found" : undefined);
      console.error(`[mercadopago] periodic check id=${id} failed`, error instanceof Error ? error.message : "unknown error");
    }
  }
  return summary;
}
