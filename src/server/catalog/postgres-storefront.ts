import type { Category } from "../../data/categories.ts";
import { themes, type Product, type ProductImage, type ThemeId } from "../../data/products.ts";
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
  price_minor: string | number | null;
  track_stock: boolean;
  on_hand: number | null;
  reserved: number | null;
  images: ProductImage[] | null;
};

/** Published products in visible categories, with their default variant. */
const SELECT_PUBLISHED = `
  SELECT p.legacy_id, p.slug, p.name, p.description, p.category_id, c.label AS category_label,
         c.image_url AS category_image, p.theme, p.tags, p.featured, p.details,
         p.catalog_code, p.requires_quote, v.price_minor, v.track_stock, i.on_hand, i.reserved,
         (SELECT json_agg(json_build_object('src', im.url, 'alt', im.alt) ORDER BY im.sort_order)
          FROM product_images im WHERE im.product_id = p.id) AS images
  FROM products p
  JOIN categories c ON c.id = p.category_id AND c.active
  JOIN product_variants v ON v.product_id = p.id AND v.is_default AND v.active
  LEFT JOIN inventory i ON i.variant_id = v.id
  WHERE p.status = 'active'
  ORDER BY p.sort_order, p.created_at, p.legacy_id`;

/** Maps a database row to the shape the store components already use. */
export function toStorefrontProduct(row: StorefrontRow): Product {
  const priceMinor = row.price_minor === null ? null : Number(row.price_minor);
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
    images,
    tags: row.tags,
    featured: row.featured,
    isDemo: true,
    availableForDirectPurchase: !row.requires_quote && priceMinor !== null,
    requiresQuote: row.requires_quote,
    details: row.details,
    ...(row.catalog_code ? { code: row.catalog_code } : {}),
    stock: row.track_stock ? Math.max(0, (row.on_hand ?? 0) - (row.reserved ?? 0)) : null,
  };
}

/** Published products with their default variant, images and available stock. */
export async function listStorefrontProducts(sql: QueryFn): Promise<Product[]> {
  return ((await sql.query(SELECT_PUBLISHED)) as StorefrontRow[]).map(toStorefrontProduct);
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
