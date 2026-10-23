import { cacheLife, cacheTag } from "next/cache";
import { categories, type Category } from "../data/categories.ts";
import { products, type Product } from "../data/products.ts";
import { listStorefrontCategories, listStorefrontProducts } from "./catalog/postgres-storefront.ts";
import { getSql, hasDatabase } from "./db/client.ts";

/** Invalidated with updateTag() by every admin change to the catalog. */
export const CATALOG_TAG = "catalog";

/**
 * The catalog the store shows. Production (no database) serves the static
 * catalog in src/data; staging/previews read every product from Postgres.
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
  return listStorefrontProducts(getSql());
}

/** Visible categories, same source and cache rules as the products. */
export async function getStorefrontCategories(): Promise<Category[]> {
  "use cache";
  cacheTag(CATALOG_TAG);
  if (!hasDatabase()) {
    cacheLife("max");
    return categories;
  }
  cacheLife("hours");
  return listStorefrontCategories(getSql());
}

export async function getStorefrontProduct(slug: string): Promise<Product | undefined> {
  return (await getStorefrontProducts()).find((product) => product.slug === slug);
}
