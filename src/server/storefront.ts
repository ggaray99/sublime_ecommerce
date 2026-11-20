import { cacheLife, cacheTag } from "next/cache";
import { categories, type Category } from "../data/categories.ts";
import { products, type Product } from "../data/products.ts";
import { listStorefrontCategories, listStorefrontProducts } from "./catalog/postgres-storefront.ts";
import { getSql, hasDatabase } from "./db/client.ts";
import { listStorefrontDesigns, type StorefrontDesign } from "./designs/repository.ts";
import type { TemplateOverrides } from "../lib/designs/mockups.ts";
import { listTemplateOverrides } from "./mockups/templates-repository.ts";

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
  // Admin changes refresh it immediately. Minutes (not hours) so a sale with
  // dates starts and ends on time in the store, not only in the cart.
  cacheLife("minutes");
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

/**
 * Published designs with the base products they can be bought on. Without a
 * database there are none (the static catalog has no designs).
 */
export async function getStorefrontDesigns(): Promise<StorefrontDesign[]> {
  "use cache";
  cacheTag(CATALOG_TAG);
  if (!hasDatabase()) {
    cacheLife("max");
    return [];
  }
  cacheLife("minutes");
  return listStorefrontDesigns(getSql());
}

/** Templates uploaded in Admin › Soportes, which replace the built-in ones in every mockup. */
export async function getMockupTemplateOverrides(): Promise<TemplateOverrides> {
  "use cache";
  cacheTag(CATALOG_TAG);
  if (!hasDatabase()) {
    cacheLife("max");
    return {};
  }
  cacheLife("minutes");
  return listTemplateOverrides(getSql());
}

export async function getStorefrontDesign(slug: string): Promise<StorefrontDesign | undefined> {
  return (await getStorefrontDesigns()).find((design) => design.slug === slug);
}

/**
 * Products linked to a mockup kind are blanks sold only with a design: the store
 * lists them through their designs, not as products of their own. The cart and
 * checkout still resolve them, so they stay in getStorefrontProducts().
 */
export async function getMockupBaseProductIds(): Promise<string[]> {
  "use cache";
  cacheTag(CATALOG_TAG);
  if (!hasDatabase()) {
    cacheLife("max");
    return [];
  }
  cacheLife("minutes");
  const rows = (await getSql().query(
    `SELECT p.legacy_id FROM mockup_bases m JOIN products p ON p.id = m.product_id WHERE p.legacy_id IS NOT NULL`,
  )) as { legacy_id: string }[];
  return rows.map((row) => row.legacy_id);
}

/** What the shop, category pages and home list as products: everything but the blanks. */
export async function getShopProducts(): Promise<Product[]> {
  const [all, bases] = await Promise.all([getStorefrontProducts(), getMockupBaseProductIds()]);
  return bases.length ? all.filter((product) => !bases.includes(product.id)) : all;
}
