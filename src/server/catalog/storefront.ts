import type { Product } from "../../data/products.ts";
import type { Availability } from "../inventory/repository.ts";
import type { CatalogVariant } from "./repository.ts";

/**
 * Merges the static catalog (copy, images, themes) with the commercial data
 * kept in the database. When a database is connected it is the authority:
 *
 * - products without an active default variant (draft, archived, missing) are hidden;
 * - price and direct-purchase availability come from the variant;
 * - `stock` is the available quantity (null when made to order).
 */
export function applyCommercialData(
  products: readonly Product[],
  activeVariants: ReadonlyMap<string, CatalogVariant>,
  availability: Availability,
): Product[] {
  const result: Product[] = [];
  for (const product of products) {
    const variant = activeVariants.get(product.id);
    if (!variant?.active) continue;
    const stock = variant.trackStock ? (availability.get(variant.sku) ?? 0) : null;
    result.push({
      ...product,
      price: variant.unitPriceMinor === null ? null : variant.unitPriceMinor / 100,
      availableForDirectPurchase: product.availableForDirectPurchase && variant.purchasable,
      stock,
    });
  }
  return result;
}

/** True when the product tracks stock and none is available. */
export const isOutOfStock = (product: Pick<Product, "stock">) => product.stock === 0;
