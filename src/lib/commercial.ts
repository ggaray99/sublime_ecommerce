/**
 * Commercial information shown under a price (transfer price, installments,
 * free shipping) and the payment methods on offer. Pure: shared by server and
 * client components. Every amount here is in pesos.
 */
import { formatPrice } from "./format.ts";
import type { ShippingRule } from "../server/shipping/rules.ts";

export type CommercialInfo = {
  /** Transfer or cash discount (automatic payment-method promotion). */
  transfer: { percent: number; minSubtotal: number | null } | null;
  /** Lowest cart subtotal with free shipping; byZone when it depends on the address. */
  freeShipping: { from: number; byZone: boolean } | null;
  /** Interest-free installments, null when the owner does not offer them. */
  installments: { count: number; minAmount: number } | null;
  /** Customers can pay online with Mercado Pago. */
  mercadoPago: boolean;
};

export const NO_COMMERCIAL_INFO: CommercialInfo = { transfer: null, freeShipping: null, installments: null, mercadoPago: false };

/** `$ 3.333,33`: formatPrice for the whole pesos, plus the centavos when there are any. */
function formatAmount(value: number): string {
  const minor = Math.round(value * 100);
  const cents = minor % 100;
  return cents ? `${formatPrice(Math.floor(minor / 100))},${String(cents).padStart(2, "0")}` : formatPrice(minor / 100);
}

const fromSuffix = (amount: number | null) => (amount ? ` en compras desde ${formatPrice(amount)}` : "");

/** Lines under a unit price (pesos). A price on request (null) shows none. */
export function commercialLines(price: number | null, info: CommercialInfo): string[] {
  if (price === null || price <= 0) return [];
  const lines: string[] = [];
  if (info.transfer) {
    const { percent, minSubtotal } = info.transfer;
    // Under the minimum purchase the checkout would not discount this product alone: show only the condition.
    if (!minSubtotal || price >= minSubtotal) {
      lines.push(`${formatPrice(Math.round((price * (100 - percent)) / 100))} con transferencia o efectivo`);
    }
    lines.push(`${percent} % de descuento pagando con transferencia o efectivo${fromSuffix(minSubtotal)}`);
  }
  if (info.installments && price >= info.installments.minAmount) {
    const { count } = info.installments;
    lines.push(`${count} cuotas sin interés de ${formatAmount(Math.round((price * 100) / count) / 100)}`);
  }
  if (info.freeShipping) {
    lines.push(`Envío gratis superando ${formatPrice(info.freeShipping.from)}${info.freeShipping.byZone ? " (según zona)" : ""}`);
  }
  return lines;
}

/** Payment methods on offer: transfer or cash always; Mercado Pago and installments only when enabled. */
export function paymentMethodLines(info: CommercialInfo): string[] {
  const lines: string[] = [];
  if (info.mercadoPago) lines.push("Mercado Pago: tarjetas de crédito y débito, dinero en cuenta");
  if (info.installments) {
    lines.push(`${info.installments.count} cuotas sin interés con tarjeta de crédito${fromSuffix(info.installments.minAmount)}`);
  }
  lines.push(info.transfer ? `Transferencia o efectivo: ${info.transfer.percent} % de descuento${fromSuffix(info.transfer.minSubtotal)}` : "Transferencia o efectivo");
  return lines;
}

/**
 * Free-shipping threshold to advertise (pesos): the default rule's when it
 * ships and has one; otherwise the lowest among the zones that ship (by zone).
 */
export function freeShippingThreshold(rules: readonly ShippingRule[]): CommercialInfo["freeShipping"] {
  const shipping = rules.filter((rule) => rule.active && rule.available);
  const fallback = shipping.find((rule) => rule.scope === "default");
  if (fallback?.freeFromMinor) return { from: fallback.freeFromMinor / 100, byZone: false };
  const amounts = shipping.flatMap((rule) => (rule.freeFromMinor ? [rule.freeFromMinor] : []));
  return amounts.length ? { from: Math.min(...amounts) / 100, byZone: true } : null;
}
