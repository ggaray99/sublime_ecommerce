"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/server/customers/session";
import { checkout, parseCheckout } from "@/server/orders/checkout";
import { getOrderRepository, getShippingRepository, ordersAvailable } from "@/server/orders/session";
import { getRepositories } from "@/server/repositories";
import { CATALOG_TAG } from "@/server/storefront";

export type CheckoutState = {
  error?: string;
  fields?: Record<string, string>;
  /** Problems per cart line (stock, unavailable products) to show next to each item. */
  issues?: { productId: string; sku?: string; message: string }[];
  values?: Record<string, string>;
};

/**
 * Places a real order (staging/previews): the server recomputes the cart,
 * reserves stock for 15 minutes and returns the confirmation page. No payment
 * is taken: it is arranged afterwards.
 */
export async function placeOrderAction(_state: CheckoutState, form: FormData): Promise<CheckoutState> {
  if (!ordersAvailable()) return { error: "Los pedidos todavía no están habilitados en este sitio." };
  const values = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
  const parsed = parseCheckout(values);
  if (!parsed.ok) return { fields: parsed.errors, error: parsed.errors.form ?? parsed.errors.cart, values };

  // Signed-in customers get the order in "Mi cuenta"; guests use the private link.
  const customer = await getCurrentCustomer().catch(() => null);
  const result = await checkout(parsed.value, customer?.id ?? null, {
    ...getRepositories(),
    orders: getOrderRepository(),
    shipping: getShippingRepository(),
  });
  // Stock changed (reserved now or released by expired holds): refresh the store.
  updateTag(CATALOG_TAG);

  if (!result.ok) {
    if (result.reason === "stock") return { error: result.message, values };
    if (result.reason === "shipping") return { error: result.message, fields: { postalCode: result.message }, values };
    return {
      error: "Algunos productos cambiaron. Revisá el carrito antes de confirmar.",
      issues: result.issues.map((issue) => ({ productId: issue.productId, sku: issue.sku, message: issue.message })),
      values,
    };
  }
  redirect(`/pedido/${result.order.id}?t=${result.order.accessToken}&nuevo=1`);
}
