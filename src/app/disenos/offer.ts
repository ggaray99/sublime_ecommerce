import type { Product } from "@/data/products";
import type { MockupKind } from "@/lib/designs/kinds";
import type { StorefrontDesign } from "@/server/designs/repository";

export type DesignBase = { kind: MockupKind; product: Product };

/** Lowest price a product sells at: its cheapest variant, or its own price. */
export function lowestPrice(product: Product): number | null {
  const prices = (product.variants ?? []).map((variant) => variant.price).filter((price): price is number => price !== null);
  return prices.length ? Math.min(...prices) : product.price;
}

/**
 * The base products a design is sold on, in kind order, resolved against the
 * store catalog (which keeps the blanks), and the lowest price among them.
 */
export function designOffer(design: StorefrontDesign, products: Product[]): { bases: DesignBase[]; from: number | null } {
  const byId = new Map(products.map((product) => [product.id, product]));
  const bases = design.bases.flatMap(({ kind, productId }) => {
    const product = byId.get(productId);
    return product ? [{ kind, product }] : [];
  });
  const prices = bases.map(({ product }) => lowestPrice(product)).filter((price): price is number => price !== null);
  return { bases, from: prices.length ? Math.min(...prices) : null };
}
