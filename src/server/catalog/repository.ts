import type { Product } from "../../data/products.ts";
import { DEFAULT_CURRENCY, pesosToMinor, type Currency } from "../money.ts";

/**
 * Sellable unit. Every product currently has a single default variant; the SKU
 * is the stable key that orders, inventory and the database will reference.
 */
export type CatalogVariant = {
  sku: string;
  productId: string;
  slug: string;
  name: string;
  /** null when the product is quoted on request. */
  unitPriceMinor: number | null;
  currency: Currency;
  purchasable: boolean;
  requiresQuote: boolean;
  active: boolean;
};

/** Persistence-agnostic access to the catalog (static today, Postgres later). */
export interface CatalogRepository {
  findVariantsByProductIds(productIds: readonly string[]): Promise<Map<string, CatalogVariant>>;
  listActiveVariants(): Promise<CatalogVariant[]>;
}

/** Stable SKU: client catalog stickers keep their printed code; demo products use their id. */
export function skuForProduct(product: Pick<Product, "id" | "code">): string {
  return product.code ? `STK-${product.code}` : `SUB-${product.id.toUpperCase()}`;
}

export function toCatalogVariant(product: Product): CatalogVariant {
  return {
    sku: skuForProduct(product),
    productId: product.id,
    slug: product.slug,
    name: product.name,
    unitPriceMinor: product.price === null ? null : pesosToMinor(product.price),
    currency: DEFAULT_CURRENCY,
    purchasable: product.availableForDirectPurchase && product.price !== null,
    requiresQuote: product.requiresQuote,
    active: true,
  };
}

/** In-memory repository over the static catalog in src/data/products.ts. */
export function createStaticCatalogRepository(products: readonly Product[]): CatalogRepository {
  const byProductId = new Map(products.map((product) => [product.id, toCatalogVariant(product)]));
  return {
    async findVariantsByProductIds(productIds) {
      const found = new Map<string, CatalogVariant>();
      for (const id of productIds) {
        const variant = byProductId.get(id);
        if (variant) found.set(id, variant);
      }
      return found;
    },
    async listActiveVariants() {
      return [...byProductId.values()].filter((variant) => variant.active);
    },
  };
}
