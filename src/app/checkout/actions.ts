"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/server/customers/session";
import { checkout, parseCheckout } from "@/server/orders/checkout";
import { getOrderRepository, getPromotionRepository, getShippingRepository, ordersAvailable } from "@/server/orders/session";
import { quoteCart } from "@/server/cart/quote";
import { parseQuoteRequest } from "@/server/cart/validation";
import { normalizeCoupon, transferPercent, type PaymentPreference } from "@/lib/promotions";
import { discountQuote } from "@/server/promotions/apply";
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
    promotions: getPromotionRepository(),
  });
  // Stock changed (reserved now or released by expired holds): refresh the store.
  updateTag(CATALOG_TAG);

  if (!result.ok) {
    if (result.reason === "stock") return { error: result.message, values };
    if (result.reason === "coupon") return { error: result.message, fields: { couponCode: result.message }, values };
    if (result.reason === "shipping") return { error: result.message, fields: { postalCode: result.message }, values };
    return {
      error: "Algunos productos cambiaron. Revisá el carrito antes de confirmar.",
      issues: result.issues.map((issue) => ({ productId: issue.productId, sku: issue.sku, message: issue.message })),
      values,
    };
  }
  redirect(`/pedido/${result.order.id}?t=${result.order.accessToken}&nuevo=1`);
}

export type DiscountPreview = {
  discountMinor: number;
  lines: { name: string; amountMinor: number; freeShipping: boolean }[];
  freeShipping: boolean;
  coupon: { code: string; applied: boolean; message: string } | null;
  /** Discount for paying by transfer or cash, to show next to that choice. */
  transferPercent: number | null;
};

/**
 * What the checkout summary shows while the customer edits the coupon or the
 * payment choice. Computed on the server (coupon codes never reach the browser);
 * placing the order computes it again.
 */
export async function previewDiscountAction(input: { cart: string; couponCode: string; paymentPreference: PaymentPreference }): Promise<DiscountPreview | null> {
  if (!ordersAvailable()) return null;
  let parsed: ReturnType<typeof parseQuoteRequest>;
  try {
    parsed = parseQuoteRequest({ lines: JSON.parse(input.cart || "[]") });
  } catch {
    return null;
  }
  if (!parsed.ok) return null;
  const [quote, promotions] = await Promise.all([quoteCart(parsed.lines, getRepositories()), getPromotionRepository().listActive()]);
  const code = normalizeCoupon(String(input.couponCode ?? "")).slice(0, 30);
  const result = discountQuote(quote, promotions, { couponCode: code, paymentPreference: input.paymentPreference === "transfer" ? "transfer" : "any" });
  return {
    discountMinor: result.discountMinor,
    lines: result.applied.map((applied) => ({ name: applied.name, amountMinor: applied.amountMinor, freeShipping: Boolean(applied.freeShipping) })),
    freeShipping: result.freeShipping,
    coupon: result.coupon ? { code: result.coupon.code, applied: result.coupon.status === "applied", message: result.coupon.message } : null,
    transferPercent: transferPercent(promotions),
  };
}
