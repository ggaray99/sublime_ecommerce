import { orderNumber, orderTotalMinor, type Order } from "../orders/repository.ts";
import { MercadoPagoError, type MercadoPagoClient } from "./mercadopago.ts";

/** Too close to the reservation end to finish paying: the order would expire mid-checkout. */
const MIN_REMAINING_MS = 60_000;

type PayableOrder = Pick<
  Order,
  "id" | "number" | "contactEmail" | "status" | "paymentPreference" | "delivery" | "subtotalMinor" | "discountMinor" | "shippingMinor" | "expiresAt"
>;

/** Pending, not reserved for transfer, with time left and a known total (shipping priced). */
export function canPayOnline(order: PayableOrder, now = new Date()): boolean {
  if (order.status !== "pending_payment" || order.paymentPreference === "transfer") return false;
  if (order.expiresAt.getTime() - now.getTime() < MIN_REMAINING_MS) return false;
  return !(order.delivery.method === "shipping" && order.shippingMinor === null);
}

export type CheckoutStart = { ok: true; url: string } | { ok: false; reason: "not_payable" | "not_connected" | "unavailable" };

/**
 * "Pagar con Mercado Pago": a Checkout Pro preference for the order total that
 * expires with the stock reservation. The order is confirmed later by the webhook.
 */
export async function startMercadoPagoCheckout(
  deps: { accessToken: () => Promise<string | null>; client: Pick<MercadoPagoClient, "createPreference"> },
  order: PayableOrder,
  urls: { returnUrl: string; notificationUrl: string },
  now = new Date(),
): Promise<CheckoutStart> {
  if (!canPayOnline(order, now)) return { ok: false, reason: "not_payable" };
  try {
    const token = await deps.accessToken();
    if (!token) return { ok: false, reason: "not_connected" };
    const preference = await deps.client.createPreference(token, {
      orderId: order.id,
      title: `Pedido ${orderNumber(order)} — Sublime`,
      amountMinor: orderTotalMinor(order),
      payerEmail: order.contactEmail,
      returnUrl: urls.returnUrl,
      notificationUrl: urls.notificationUrl,
      expiresAt: order.expiresAt,
    });
    return { ok: true, url: preference.initPoint };
  } catch (error) {
    if (error instanceof MercadoPagoError) return { ok: false, reason: "unavailable" };
    throw error;
  }
}
