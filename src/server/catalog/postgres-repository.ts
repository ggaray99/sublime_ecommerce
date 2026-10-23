import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { Currency } from "../money.ts";
import type { CatalogRepository, CatalogVariant } from "./repository.ts";

type VariantRow = {
  product_id: string;
  sku: string;
  slug: string;
  name: string;
  price_minor: string | number | null;
  currency: string;
  requires_quote: boolean;
  track_stock: boolean;
  active: boolean;
};

const SELECT_DEFAULT_VARIANTS = `
  SELECT p.legacy_id AS product_id, v.sku, p.slug, p.name, v.price_minor, v.currency,
         p.requires_quote, v.track_stock, (p.status = 'active' AND v.active) AS active
  FROM products p
  JOIN product_variants v ON v.product_id = p.id AND v.is_default`;

function toVariant(row: VariantRow): CatalogVariant {
  // bigint columns arrive as strings; prices stay far below Number.MAX_SAFE_INTEGER.
  const unitPriceMinor = row.price_minor === null ? null : Number(row.price_minor);
  return {
    sku: row.sku,
    productId: row.product_id,
    slug: row.slug,
    name: row.name,
    unitPriceMinor,
    currency: row.currency as Currency,
    purchasable: !row.requires_quote && unitPriceMinor !== null,
    requiresQuote: row.requires_quote,
    trackStock: row.track_stock,
    active: row.active,
  };
}

/**
 * Catalog backed by the 0001 schema. Public product ids are the legacy ids
 * (p13, c088…) that carts and URLs already use.
 */
export function createPostgresCatalogRepository(sql: NeonQueryFunction<false, false>): CatalogRepository {
  return {
    async findVariantsByProductIds(productIds) {
      if (!productIds.length) return new Map();
      const rows = (await sql.query(`${SELECT_DEFAULT_VARIANTS} WHERE p.legacy_id = ANY($1::text[])`, [
        [...productIds],
      ])) as VariantRow[];
      return new Map(rows.map((row) => [row.product_id, toVariant(row)]));
    },
    async listActiveVariants() {
      const rows = (await sql.query(
        `${SELECT_DEFAULT_VARIANTS} WHERE p.status = 'active' AND v.active ORDER BY p.legacy_id`,
      )) as VariantRow[];
      return rows.map(toVariant);
    },
  };
}
