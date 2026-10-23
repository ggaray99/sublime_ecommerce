import type { CatalogRepository } from "../catalog/repository.ts";
import { quoteCart, type CartQuote, type QuoteIssue } from "../cart/quote.ts";
import { parseQuoteRequest } from "../cart/validation.ts";
import { parseAddress, type FieldErrors } from "../customers/validation.ts";
import type { InventoryRepository } from "../inventory/repository.ts";
import type { ShippingRepository } from "../shipping/repository.ts";
import { quoteShipping } from "../shipping/rules.ts";
import { OrderError, type Delivery, type Order, type OrderRepository, type ShippingSnapshot } from "./repository.ts";

export type CheckoutInput = {
  idempotencyKey: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  delivery: Delivery;
  notes: string;
  lines: { productId: string; quantity: number; sku?: string }[];
};

type Data = Record<string, unknown>;
const text = (data: Data, key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");

/**
 * Validates the checkout form. `cart` is the browser cart serialized as JSON
 * (ids, SKUs and quantities only); prices are always recomputed on the server.
 */
export function parseCheckout(data: Data): { ok: true; value: CheckoutInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const idempotencyKey = text(data, "idempotencyKey");
  if (!/^[A-Za-z0-9-]{8,120}$/.test(idempotencyKey)) errors.form = "Recargá la página e intentá de nuevo.";

  const contactName = text(data, "contactName");
  if (contactName.length < 2 || contactName.length > 120) errors.contactName = "Completá tu nombre.";
  const contactEmail = text(data, "contactEmail").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail) || contactEmail.length > 200) errors.contactEmail = "Ingresá un email válido.";
  const contactPhone = text(data, "contactPhone");
  if (contactPhone && !/^[+()\d\s-]{6,40}$/.test(contactPhone)) errors.contactPhone = "Ingresá un teléfono válido o dejalo vacío.";

  let delivery: Delivery = { method: "pickup" };
  const method = text(data, "deliveryMethod");
  if (method === "shipping") {
    // The address has its own delivery notes ("addressNotes"); "notes" is for the order.
    const field = (name: string) => (name === "notes" ? "addressNotes" : name);
    const address = parseAddress({ get: (name: string) => (typeof data[field(name)] === "string" ? (data[field(name)] as string) : null) });
    if (!address.ok) {
      for (const [key, message] of Object.entries(address.errors as Record<string, string>)) errors[key === "notes" ? "addressNotes" : key] = message;
    } else {
      const { recipient, street, streetNumber, apartment, city, province, postalCode, notes } = address.value;
      delivery = { method: "shipping", address: { recipient, street, streetNumber, apartment, city, province, postalCode, notes } };
    }
  } else if (method !== "pickup") {
    errors.deliveryMethod = "Elegí cómo recibir el pedido.";
  }

  const notes = text(data, "notes");
  if (notes.length > 500) errors.notes = "Hasta 500 caracteres.";

  let lines: CheckoutInput["lines"] = [];
  try {
    const parsed = parseQuoteRequest({ lines: JSON.parse(text(data, "cart") || "[]") });
    if (parsed.ok) lines = parsed.lines;
    else errors.cart = "El carrito tiene datos inválidos o está vacío.";
  } catch {
    errors.cart = "El carrito tiene datos inválidos.";
  }

  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value: { idempotencyKey, contactName, contactEmail, contactPhone, delivery, notes, lines } };
}

export type CheckoutResult =
  | { ok: true; order: Order }
  | { ok: false; reason: "cart"; quote: CartQuote; issues: QuoteIssue[] }
  | { ok: false; reason: "stock"; message: string }
  | { ok: false; reason: "shipping"; message: string };

/**
 * Places an order from the browser cart: releases expired holds, recomputes
 * prices and availability on the server, and reserves stock atomically.
 */
export async function checkout(
  input: CheckoutInput,
  customerId: string | null,
  deps: { catalog: CatalogRepository; inventory: InventoryRepository; orders: OrderRepository; shipping: ShippingRepository },
): Promise<CheckoutResult> {
  // Retrying the same submit returns the order already created.
  const previous = await deps.orders.findByIdempotencyKey(input.idempotencyKey);
  if (previous) return { ok: true, order: previous };

  await deps.orders.releaseExpired();
  const quote = await quoteCart(input.lines, deps);
  if (!quote.valid) return { ok: false, reason: "cart", quote, issues: quote.issues };

  // Shipping is quoted on the server too: the browser only shows an estimate.
  let shipping: ShippingSnapshot;
  if (input.delivery.method === "pickup") {
    const pickup = await deps.shipping.getPickup();
    if (!pickup.enabled) return { ok: false, reason: "shipping", message: "El retiro no está disponible por ahora. Elegí envío a domicilio." };
    shipping = { method: "pickup", costMinor: 0, label: "Retiro en el taller", ruleId: null, free: false, etaMinDays: null, etaMaxDays: null };
  } else {
    const rules = await deps.shipping.listRules({ activeOnly: true });
    const estimate = quoteShipping(rules, input.delivery.address, quote.subtotalMinor);
    if (!estimate.covered) return { ok: false, reason: "shipping", message: estimate.reason };
    shipping = {
      method: "shipping",
      costMinor: estimate.costMinor,
      label: estimate.label,
      ruleId: estimate.ruleId,
      free: estimate.free,
      etaMinDays: estimate.etaMinDays,
      etaMaxDays: estimate.etaMaxDays,
    };
  }

  try {
    const order = await deps.orders.placeOrder({
      idempotencyKey: input.idempotencyKey,
      customerId,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      delivery: input.delivery,
      notes: input.notes,
      shipping,
      lines: quote.lines.map((line) => ({
        sku: line.sku,
        productId: line.productId,
        name: line.name,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
      })),
    });
    return { ok: true, order };
  } catch (error) {
    if (error instanceof OrderError && error.code === "insufficient_stock") {
      // Someone else took the last units between the quote and the order: show what is left.
      const fresh = await quoteCart(input.lines, deps);
      return fresh.valid ? { ok: false, reason: "stock", message: error.message } : { ok: false, reason: "cart", quote: fresh, issues: fresh.issues };
    }
    throw error;
  }
}

export type { FieldErrors };
