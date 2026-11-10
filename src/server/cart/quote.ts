import type { CatalogRepository } from "../catalog/repository.ts";
import type { InventoryRepository } from "../inventory/repository.ts";
import { DEFAULT_CURRENCY, multiplyMinor, type Currency } from "../money.ts";

export const MAX_CART_LINES = 50;
export const MAX_LINE_QUANTITY = 99;

/** `sku` picks a variant (size, color…); without it the product's default variant is used. */
export type QuoteRequestLine = { productId: string; quantity: number; sku?: string };

export type QuoteIssueCode =
  | "unknown_product"
  | "variant_required"
  | "requires_quote"
  | "not_purchasable"
  | "insufficient_stock";

export type QuoteIssue = { productId: string; sku?: string; code: QuoteIssueCode; message: string };

export type QuotedLine = {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  /** null when stock is not tracked for this SKU. */
  available: number | null;
  /** For category promotions (empty in the static catalog). */
  categoryId: string;
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
  // Same product and variant → one line.
  const merged = new Map<string, { productId: string; sku?: string; quantity: number }>();
  for (const line of lines) {
    const key = `${line.productId}|${line.sku ?? ""}`;
    const current = merged.get(key);
    merged.set(key, { productId: line.productId, sku: line.sku, quantity: (current?.quantity ?? 0) + line.quantity });
  }
  const requestedLines = [...merged.values()];

  const [defaults, bySku] = await Promise.all([
    deps.catalog.findVariantsByProductIds([...new Set(requestedLines.filter((line) => !line.sku).map((line) => line.productId))]),
    deps.catalog.findVariantsBySkus([...new Set(requestedLines.flatMap((line) => (line.sku ? [line.sku] : [])))]),
  ]);
  const resolve = (line: { productId: string; sku?: string }) => {
    if (!line.sku) return defaults.get(line.productId);
    const variant = bySku.get(line.sku);
    // A SKU of another product is treated as unknown, never as that other product.
    return variant?.productId === line.productId ? variant : undefined;
  };
  const resolved = requestedLines.map((line) => ({ line, variant: resolve(line) }));
  const availability = await deps.inventory.getAvailability(resolved.flatMap(({ variant }) => (variant ? [variant.sku] : [])));

  const quoted: QuotedLine[] = [];
  const issues: QuoteIssue[] = [];

  for (const { line, variant } of resolved) {
    const { productId, sku, quantity: requested } = line;
    if (!variant || !variant.active) {
      issues.push({ productId, sku, code: "unknown_product", message: "El producto no existe o no está disponible." });
      continue;
    }
    if (variant.hasOptions && !sku) {
      issues.push({ productId, code: "variant_required", message: "Elegí una opción (talle, color…) antes de comprar." });
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
      categoryId: variant.categoryId ?? "",
    });
  }

  const subtotalMinor = quoted.reduce((total, line) => total + line.lineTotalMinor, 0);
  const capped = requestedLines.some((line) => line.quantity > MAX_LINE_QUANTITY);

  return {
    currency: DEFAULT_CURRENCY,
    lines: quoted,
    issues,
    subtotalMinor,
    shipping: { status: "pending" },
    valid: issues.length === 0 && !capped && quoted.length > 0,
  };
}
