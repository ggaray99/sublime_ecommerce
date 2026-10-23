import type { Product, ProductVariant } from "../data/products";

/**
 * Only product ids, variant SKUs and quantities are persisted: no personal data.
 * `sku` identifies the variant (size, color…) of products that have options.
 */
export type CartLine = { productId: string; quantity: number; sku?: string };

export const MAX_QUANTITY = 99;

const clamp = (quantity: number) => Math.min(MAX_QUANTITY, Math.max(1, Math.floor(quantity)));
const sameLine = (line: CartLine, productId: string, sku?: string) => line.productId === productId && (line.sku ?? "") === (sku ?? "");

export function addLine(lines: readonly CartLine[], productId: string, quantity = 1, sku?: string): CartLine[] {
  const existing = lines.find((line) => sameLine(line, productId, sku));
  if (!existing) return [...lines, { productId, quantity: clamp(quantity), ...(sku ? { sku } : {}) }];
  return lines.map((line) => (sameLine(line, productId, sku) ? { ...line, quantity: clamp(line.quantity + quantity) } : line));
}

export function setQuantity(lines: readonly CartLine[], productId: string, quantity: number, sku?: string): CartLine[] {
  if (!Number.isFinite(quantity)) return [...lines];
  return lines.map((line) => (sameLine(line, productId, sku) ? { ...line, quantity: clamp(quantity) } : line));
}

export function removeLine(lines: readonly CartLine[], productId: string, sku?: string): CartLine[] {
  return lines.filter((line) => !sameLine(line, productId, sku));
}

/** Parses persisted cart data defensively; anything malformed is dropped. */
export function parseCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (line): line is CartLine =>
          typeof line === "object" &&
          line !== null &&
          typeof (line as CartLine).productId === "string" &&
          typeof (line as CartLine).quantity === "number" &&
          Number.isFinite((line as CartLine).quantity) &&
          ((line as CartLine).sku === undefined || typeof (line as CartLine).sku === "string"),
      )
      .map((line) => ({ productId: line.productId, quantity: clamp(line.quantity), ...(line.sku ? { sku: line.sku } : {}) }));
  } catch {
    return [];
  }
}

export type CartItem = {
  product: Product;
  /** Chosen variant of a product with options. */
  variant?: ProductVariant;
  /** "Talle M · Color Negro" */
  optionsLabel?: string;
  quantity: number;
  /** Unit price of the product or of its variant (ARS). */
  unitPrice: number;
  /** Available units of the product or variant; null/undefined when unknown or made to order. */
  stock?: number | null;
  lineTotal: number;
};

export type CartSummary = { items: CartItem[]; count: number; subtotal: number };

export const variantLabel = (product: Pick<Product, "optionNames">, variant: ProductVariant) =>
  (product.optionNames ?? [])
    .filter((name) => variant.options[name])
    .map((name) => `${name} ${variant.options[name]}`)
    .join(" · ");

/**
 * Resolves lines against the catalog, ignoring unknown or quote-only products.
 * Products with options need a known variant SKU; lines without one are dropped.
 */
export function summarizeCart(lines: readonly CartLine[], catalog: readonly Product[]): CartSummary {
  const items: CartItem[] = [];
  for (const line of lines) {
    const product = catalog.find((candidate) => candidate.id === line.productId);
    if (!product || !product.availableForDirectPurchase) continue;
    if (product.variants) {
      const variant = product.variants.find((candidate) => candidate.sku === line.sku);
      if (!variant || variant.price === null) continue;
      items.push({
        product,
        variant,
        optionsLabel: variantLabel(product, variant),
        quantity: line.quantity,
        unitPrice: variant.price,
        stock: variant.stock,
        lineTotal: variant.price * line.quantity,
      });
      continue;
    }
    if (product.price === null || line.sku) continue;
    items.push({ product, quantity: line.quantity, unitPrice: product.price, stock: product.stock, lineTotal: product.price * line.quantity });
  }
  return {
    items,
    count: items.reduce((total, item) => total + item.quantity, 0),
    subtotal: items.reduce((total, item) => total + item.lineTotal, 0),
  };
}
