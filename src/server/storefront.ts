import { cacheLife, cacheTag } from "next/cache";
import { products, type Product } from "../data/products.ts";
import { applyCommercialData } from "./catalog/storefront.ts";
import { hasDatabase } from "./db/client.ts";
import { getRepositories } from "./repositories.ts";

/** Invalidated with updateTag() by every admin change to price, status or stock. */
export const CATALOG_TAG = "catalog";

/**
 * The catalog the store shows. Production (no database) serves the static
 * catalog; staging/previews overlay price, status and stock from Postgres.
 */
export async function getStorefrontProducts(): Promise<Product[]> {
  "use cache";
  cacheTag(CATALOG_TAG);
  if (!hasDatabase()) {
    cacheLife("max");
    return products;
  }
  // Admin changes refresh it immediately; the lifetime is only a safety net.
  cacheLife("hours");
  const { catalog, inventory } = getRepositories();
  const variants = await catalog.listActiveVariants();
  const availability = await inventory.getAvailability(variants.map((variant) => variant.sku));
  return applyCommercialData(products, new Map(variants.map((variant) => [variant.productId, variant])), availability);
}

export async function getStorefrontProduct(slug: string): Promise<Product | undefined> {
  return (await getStorefrontProducts()).find((product) => product.slug === slug);
}
