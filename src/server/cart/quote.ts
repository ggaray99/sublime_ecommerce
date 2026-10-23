import type { CatalogRepository } from "../catalog/repository.ts";
import type { InventoryRepository } from "../inventory/repository.ts";
import { DEFAULT_CURRENCY, multiplyMinor, type Currency } from "../money.ts";

export const MAX_CART_LINES = 50;
export const MAX_LINE_QUANTITY = 99;

export type QuoteRequestLine = { productId: string; quantity: number };

export type QuoteIssueCode =
  | "unknown_product"
  | "requires_quote"
  | "not_purchasable"
  | "insufficient_stock";

export type QuoteIssue = { productId: string; code: QuoteIssueCode; message: string };

export type QuotedLine = {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  /** null when stock is not tracked for this SKU. */
  available: number | null;
};

export type CartQuote = {
  currency: Currency;
  lines: QuotedLine[];
  issues: QuoteIssue[];
  subtotalMinor: number;
  /** Shipping rules are not defined yet: never computed or promised. */
  shipping: { status: "pending" };
  /** True only when every requested line can be bought as requested. */
  valid: boolean;
};

/**
 * Recomputes a cart on the server from catalog prices and availability.
 * Client-supplied prices are never read: the request only carries ids and
 * quantities. Duplicate lines for the same product are merged.
 */
export async function quoteCart(
  lines: readonly QuoteRequestLine[],
  deps: { catalog: CatalogRepository; inventory: InventoryRepository },
): Promise<CartQuote> {
  const merged = new Map<string, number>();
  for (const line of lines) merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity);

  const variants = await deps.catalog.findVariantsByProductIds([...merged.keys()]);
  const availability = await deps.inventory.getAvailability([...variants.values()].map((variant) => variant.sku));

  const quoted: QuotedLine[] = [];
  const issues: QuoteIssue[] = [];

  for (const [productId, requested] of merged) {
    const variant = variants.get(productId);
    if (!variant || !variant.active) {
      issues.push({ productId, code: "unknown_product", message: "El producto no existe o no está disponible." });
      continue;
    }
    if (variant.requiresQuote) {
      issues.push({ productId, code: "requires_quote", message: "Este producto se cotiza a pedido." });
      continue;
    }
    if (!variant.purchasable || variant.unitPriceMinor === null) {
      issues.push({ productId, code: "not_purchasable", message: "Este producto no se puede comprar directamente." });
      continue;
    }

    const available = availability.get(variant.sku) ?? null;
    let quantity = Math.min(requested, MAX_LINE_QUANTITY);
    if (available !== null && quantity > available) {
      issues.push({
        productId,
        code: "insufficient_stock",
        message: available > 0 ? `Solo hay ${available} unidades disponibles.` : "Sin stock disponible.",
      });
      quantity = available;
    }
    if (quantity <= 0) continue;

    quoted.push({
      productId,
      sku: variant.sku,
      name: variant.name,
      quantity,
      unitPriceMinor: variant.unitPriceMinor,
      lineTotalMinor: multiplyMinor(variant.unitPriceMinor, quantity),
      available,
    });
  }

  const subtotalMinor = quoted.reduce((total, line) => total + line.lineTotalMinor, 0);
  const capped = [...merged.values()].some((quantity) => quantity > MAX_LINE_QUANTITY);

  return {
    currency: DEFAULT_CURRENCY,
    lines: quoted,
    issues,
    subtotalMinor,
    shipping: { status: "pending" },
    valid: issues.length === 0 && !capped && quoted.length > 0,
  };
}
