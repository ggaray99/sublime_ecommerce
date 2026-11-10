import { orderNumber, orderTotalMinor, type Order } from "../orders/repository.ts";
import { MercadoPagoError, type MercadoPagoClient } from "./mercadopago.ts";

/** Too close to the reservation end to finish paying: the order would expire mid-checkout. */
const MIN_REMAINING_MS = 60_000;

type PayableOrder = Pick<
  Order,
  "id" | "number" | "status" | "paymentPreference" | "delivery" | "subtotalMinor" | "discountMinor" | "shippingMinor" | "expiresAt"
>;

/** Pending, not reserved for transfer, with time left and a known total (shipping priced). */
export function canPayOnline(order: PayableOrder, now = new Date()): boolean {
  if (order.status !== "pending_payment" || order.paymentPreference === "transfer") return false;
  if (order.expiresAt.getTime() - now.getTime() < MIN_REMAINING_MS) return false;
  return !(order.delivery.method === "shipping" && order.shippingMinor === null);
}

export type CheckoutStart = { ok: true; url: string } | { ok: false; reason: "not_payable" | "not_connected" | "unavailable" };

/**
 * "Pagar con Mercado Pago": a Checkout Pro order (Orders API) for the order total
 * that expires with the stock reservation. The order is confirmed later by the webhook.
 */
export async function startMercadoPagoCheckout(
  deps: {
    accessToken: () => Promise<string | null>;
    client: Pick<MercadoPagoClient, "createCheckoutOrder">;
    /** Remembers the Mercado Pago order so a periodic check can confirm it if the notice is lost. */
    recordStarted: (mercadoPagoOrderId: string, orderId: string) => Promise<void>;
  },
  order: PayableOrder,
  urls: { returnUrl: string },
  now = new Date(),
): Promise<CheckoutStart> {
  if (!canPayOnline(order, now)) return { ok: false, reason: "not_payable" };
  try {
    const token = await deps.accessToken();
    if (!token) return { ok: false, reason: "not_connected" };
    const checkout = await deps.client.createCheckoutOrder(token, {
      orderId: order.id,
      title: `Pedido ${orderNumber(order)} — Sublime`,
      amountMinor: orderTotalMinor(order),
      returnUrl: urls.returnUrl,
      // Rounded down: Mercado Pago must never accept a payment after the reservation ends.
      expiresInMinutes: Math.floor((order.expiresAt.getTime() - now.getTime()) / 60_000),
    });
    // The webhook still confirms it: a failed record only loses the fallback check.
    await deps.recordStarted(checkout.id, order.id).catch((error: unknown) => {
      console.error(`[mercadopago] could not record checkout ${checkout.id} for order ${order.id}`, error instanceof Error ? error.message : "unknown error");
    });
    return { ok: true, url: checkout.checkoutUrl };
  } catch (error) {
    if (error instanceof MercadoPagoError) {
      console.error(`[mercadopago] checkout for order ${order.id} failed: ${error.status} ${error.code} ${error.detail}`.trim());
      return { ok: false, reason: "unavailable" };
    }
    throw error;
  }
}
