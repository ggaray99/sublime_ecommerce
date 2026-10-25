import type { Category } from "../../data/categories.ts";
import { themes, type Product, type ProductImage, type ProductVariant, type ThemeId } from "../../data/products.ts";
import { effectivePriceMinor, saleActive, saleOf } from "../../lib/pricing.ts";
import type { QueryFn } from "../customers/repository.ts";

/** Used when a category has no image yet. */
export const FALLBACK_CATEGORY_IMAGE = "/demo/categories/stickers.webp";

type StorefrontRow = {
  legacy_id: string;
  slug: string;
  name: string;
  description: string;
  category_id: string;
  category_label: string;
  category_image: string;
  theme: string;
  tags: string[];
  featured: boolean;
  details: string[];
  catalog_code: string | null;
  requires_quote: boolean;
  option_names: string[];
  variants: { sku: string; options: Record<string, string>; price_minor: string | number | null; track_stock: boolean; available: number }[];
  sale_percent: number | null;
  sale_price_minor: string | number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  images: ProductImage[] | null;
};

/** Published products in visible categories, with their active variants. */
const SELECT_PUBLISHED = `
  SELECT p.legacy_id, p.slug, p.name, p.description, p.category_id, c.label AS category_label,
         c.image_url AS category_image, p.theme, p.tags, p.featured, p.details,
         p.catalog_code, p.requires_quote, p.option_names, vs.variants,
         p.sale_percent, p.sale_price_minor, p.sale_starts_at, p.sale_ends_at,
         (SELECT json_agg(json_build_object('src', im.url, 'alt', im.alt) ORDER BY im.sort_order)
          FROM product_images im WHERE im.product_id = p.id) AS images
  FROM products p
  JOIN categories c ON c.id = p.category_id AND c.active
  JOIN LATERAL (
    SELECT json_agg(json_build_object(
             'sku', v.sku, 'options', v.options, 'price_minor', v.price_minor, 'track_stock', v.track_stock,
             'available', greatest(0, coalesce(i.on_hand, 0) - coalesce(i.reserved, 0)))
           ORDER BY v.sort_order, v.sku) AS variants
    FROM product_variants v LEFT JOIN inventory i ON i.variant_id = v.id
    WHERE v.product_id = p.id AND v.active
  ) vs ON vs.variants IS NOT NULL
  WHERE p.status = 'active'
  ORDER BY p.sort_order, p.created_at, p.legacy_id`;

/** Maps a database row to the shape the store components already use. */
export function toStorefrontProduct(row: StorefrontRow, now = new Date()): Product {
  const sale = saleOf(row);
  const onSale = saleActive(sale, now) && !row.requires_quote;
  const variants: ProductVariant[] = row.variants.map((variant) => {
    const regular = variant.price_minor === null ? null : Number(variant.price_minor);
    const current = regular === null ? null : effectivePriceMinor(regular, sale, now);
    return {
      sku: variant.sku,
      options: variant.options,
      price: current === null ? null : current / 100,
      ...(onSale && regular !== null && current !== regular ? { regularPrice: regular / 100 } : {}),
      stock: variant.track_stock ? variant.available : null,
    };
  });
  const regularPrices = variants.flatMap((variant) => (variant.price === null ? [] : [variant.regularPrice ?? variant.price]));
  const prices = variants.flatMap((variant) => (variant.price === null ? [] : [variant.price]));
  // "Desde": the lowest price among the active variants.
  const priceMinor = row.requires_quote || !prices.length ? null : Math.round(Math.min(...prices) * 100);
  const tracked = variants.some((variant) => variant.stock !== null);
  // Products without photos yet show their category image instead of breaking the card.
  const images = row.images?.length ? row.images : [{ src: row.category_image || FALLBACK_CATEGORY_IMAGE, alt: row.name }];
  return {
    id: row.legacy_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category_id,
    categoryLabel: row.category_label,
    theme: (row.theme in themes ? row.theme : "grafico") as ThemeId,
    price: priceMinor === null ? null : priceMinor / 100,
    ...(onSale && priceMinor !== null && regularPrices.length && Math.min(...regularPrices) * 100 > priceMinor
      ? { regularPrice: Math.min(...regularPrices), ...(sale.endsAt ? { saleEndsAt: sale.endsAt.toISOString() } : {}) }
      : {}),
    images,
    tags: row.tags,
    featured: row.featured,
    isDemo: true,
    availableForDirectPurchase: !row.requires_quote && priceMinor !== null,
    requiresQuote: row.requires_quote,
    details: row.details,
    ...(row.catalog_code ? { code: row.catalog_code } : {}),
    stock: tracked ? variants.reduce((total, variant) => total + (variant.stock ?? 0), 0) : null,
    ...(row.option_names.length ? { optionNames: row.option_names, variants } : {}),
  };
}

/** Published products with their active variants, images and available stock. */
export async function listStorefrontProducts(sql: QueryFn): Promise<Product[]> {
  const now = new Date();
  return ((await sql.query(SELECT_PUBLISHED)) as StorefrontRow[]).map((row) => toStorefrontProduct(row, now));
}

type CategoryRow = { id: string; label: string; tagline: string; description: string; image_url: string };

/** Visible categories in display order. */
export async function listStorefrontCategories(sql: QueryFn): Promise<Category[]> {
  const rows = (await sql.query(
    "SELECT id, label, tagline, description, image_url FROM categories WHERE active ORDER BY sort_order, label",
  )) as CategoryRow[];
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    tagline: row.tagline,
    description: row.description,
    image: row.image_url || FALLBACK_CATEGORY_IMAGE,
  }));
}
