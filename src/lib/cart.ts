import type { Product } from "../data/products";

/** Only product ids and quantities are persisted: no personal data. */
export type CartLine = { productId: string; quantity: number };

export const MAX_QUANTITY = 99;

const clamp = (quantity: number) => Math.min(MAX_QUANTITY, Math.max(1, Math.floor(quantity)));

export function addLine(lines: readonly CartLine[], productId: string, quantity = 1): CartLine[] {
  const existing = lines.find((line) => line.productId === productId);
  if (!existing) return [...lines, { productId, quantity: clamp(quantity) }];
  return lines.map((line) =>
    line.productId === productId ? { ...line, quantity: clamp(line.quantity + quantity) } : line,
  );
}

export function setQuantity(lines: readonly CartLine[], productId: string, quantity: number): CartLine[] {
  if (!Number.isFinite(quantity)) return [...lines];
  return lines.map((line) => (line.productId === productId ? { ...line, quantity: clamp(quantity) } : line));
}

export function removeLine(lines: readonly CartLine[], productId: string): CartLine[] {
  return lines.filter((line) => line.productId !== productId);
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
          Number.isFinite((line as CartLine).quantity),
      )
      .map((line) => ({ productId: line.productId, quantity: clamp(line.quantity) }));
  } catch {
    return [];
  }
}

export type CartItem = { product: Product; quantity: number; lineTotal: number };

export type CartSummary = { items: CartItem[]; count: number; subtotal: number };

/** Resolves lines against the catalog, ignoring unknown or quote-only products. */
export function summarizeCart(lines: readonly CartLine[], catalog: readonly Product[]): CartSummary {
  const items: CartItem[] = [];
  for (const line of lines) {
    const product = catalog.find((candidate) => candidate.id === line.productId);
    if (!product || product.price === null || !product.availableForDirectPurchase) continue;
    items.push({ product, quantity: line.quantity, lineTotal: product.price * line.quantity });
  }
  return {
    items,
    count: items.reduce((total, item) => total + item.quantity, 0),
    subtotal: items.reduce((total, item) => total + item.lineTotal, 0),
  };
}
