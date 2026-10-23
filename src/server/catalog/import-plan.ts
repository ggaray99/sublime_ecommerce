import type { Category } from "../../data/categories.ts";
import type { Product } from "../../data/products.ts";
import { skuForProduct, toCatalogVariant } from "./repository.ts";

/**
 * Dry-run plan to move the static catalog into the 0001 schema. It mirrors the
 * database CHECK/UNIQUE constraints so problems surface before touching a database.
 */
export type CategoryRow = { id: string; label: string; description: string; sort_order: number };
export type ProductRow = {
  legacy_id: string;
  slug: string;
  name: string;
  description: string;
  category_id: string;
  catalog_code: string | null;
  requires_quote: boolean;
  status: "active";
  tags: string[];
};
export type VariantRow = {
  product_legacy_id: string;
  sku: string;
  price_minor: number | null;
  currency: "ARS";
  track_stock: boolean;
  is_default: true;
};
/** Initial count for tracked variants. Real quantities must come from a physical count. */
export type InventoryRow = { sku: string; on_hand: number };
export type ImageRow = { product_legacy_id: string; url: string; alt: string; sort_order: number };

export type ImportPlan = {
  categories: CategoryRow[];
  products: ProductRow[];
  variants: VariantRow[];
  images: ImageRow[];
  inventory: InventoryRow[];
  errors: string[];
};

/**
 * Placeholder stock for staging rehearsals only. The business has not provided
 * real counts yet; never load this into production.
 */
export const STAGING_PLACEHOLDER_STOCK = 20;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9][A-Z0-9-]{1,39}$/;
const CODE = /^[0-9]{3,6}$/;
const CATEGORY_ID = /^[a-z0-9-]{1,40}$/;

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) (seen.has(value) ? duplicates : seen).add(value);
  return [...duplicates];
}

export function buildImportPlan(
  categories: readonly Category[],
  products: readonly Product[],
  initialStock: number = STAGING_PLACEHOLDER_STOCK,
): ImportPlan {
  const errors: string[] = [];
  const categoryIds = new Set(categories.map((category) => category.id));

  const categoryRows: CategoryRow[] = categories.map((category, index) => {
    if (!CATEGORY_ID.test(category.id)) errors.push(`categoría ${category.id}: id inválido`);
    return { id: category.id, label: category.label, description: category.description, sort_order: index };
  });

  const productRows: ProductRow[] = [];
  const variantRows: VariantRow[] = [];
  const imageRows: ImageRow[] = [];
  const inventoryRows: InventoryRow[] = [];

  for (const product of products) {
    const where = `producto ${product.id}`;
    if (!SLUG.test(product.slug)) errors.push(`${where}: slug inválido (${product.slug})`);
    if (!categoryIds.has(product.category)) errors.push(`${where}: categoría inexistente (${product.category})`);
    if (product.name.length < 1 || product.name.length > 120) errors.push(`${where}: nombre fuera de rango`);
    if (product.code !== undefined && !CODE.test(product.code)) errors.push(`${where}: código inválido (${product.code})`);
    if (product.price === null && !product.requiresQuote) errors.push(`${where}: sin precio y sin cotización`);
    if (!product.images.length) errors.push(`${where}: sin imágenes`);

    const variant = toCatalogVariant(product);
    const sku = skuForProduct(product);
    if (!SKU.test(sku)) errors.push(`${where}: SKU inválido (${sku})`);

    productRows.push({
      legacy_id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      category_id: product.category,
      catalog_code: product.code ?? null,
      requires_quote: product.requiresQuote,
      status: "active",
      tags: [...product.tags],
    });
    variantRows.push({
      product_legacy_id: product.id,
      sku,
      price_minor: variant.unitPriceMinor,
      currency: "ARS",
      track_stock: variant.trackStock,
      is_default: true,
    });
    if (variant.trackStock) inventoryRows.push({ sku, on_hand: initialStock });
    product.images.forEach((image, index) => {
      if (!image.alt.trim()) errors.push(`${where}: imagen ${index + 1} sin texto alternativo`);
      imageRows.push({ product_legacy_id: product.id, url: image.src, alt: image.alt, sort_order: index });
    });
  }

  for (const [label, values] of [
    ["legacy_id", productRows.map((row) => row.legacy_id)],
    ["slug", productRows.map((row) => row.slug)],
    ["sku", variantRows.map((row) => row.sku)],
    ["catalog_code", productRows.flatMap((row) => (row.catalog_code ? [row.catalog_code] : []))],
  ] as const) {
    for (const duplicate of findDuplicates(values)) errors.push(`${label} duplicado: ${duplicate}`);
  }

  if (!Number.isInteger(initialStock) || initialStock < 0) errors.push(`stock inicial inválido: ${initialStock}`);

  return {
    categories: categoryRows,
    products: productRows,
    variants: variantRows,
    images: imageRows,
    inventory: inventoryRows,
    errors,
  };
}

const literal = (value: string | number | boolean | null): string => {
  if (value === null) return "NULL";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return `'${value.replace(/'/g, "''")}'`;
};

const arrayLiteral = (values: readonly string[]) =>
  values.length ? `ARRAY[${values.map(literal).join(", ")}]::text[]` : "'{}'::text[]";

/** Renders the plan as a reviewable, transactional seed for a staging database. */
export function renderSeedSql(plan: ImportPlan): string {
  const out: string[] = [
    "-- Generated by scripts/catalog-import-dry-run.mjs from src/data. Do not edit by hand.",
    "-- Status: REHEARSAL. Prices and initial stock are placeholders; apply to staging only.",
    "-- Applied inside a transaction by scripts/db-migrate.mjs --seed.",
    "",
  ];
  for (const row of plan.categories) {
    out.push(
      `INSERT INTO categories (id, label, description, sort_order) VALUES (${[row.id, row.label, row.description, row.sort_order].map(literal).join(", ")});`,
    );
  }
  out.push("");
  for (const row of plan.products) {
    out.push(
      `INSERT INTO products (legacy_id, slug, name, description, category_id, catalog_code, requires_quote, status, tags) VALUES (${[
        row.legacy_id,
        row.slug,
        row.name,
        row.description,
        row.category_id,
        row.catalog_code,
        row.requires_quote,
        row.status,
      ]
        .map(literal)
        .join(", ")}, ${arrayLiteral(row.tags)});`,
    );
  }
  out.push("");
  for (const row of plan.variants) {
    out.push(
      `INSERT INTO product_variants (product_id, sku, price_minor, currency, track_stock, is_default) SELECT id, ${[
        row.sku,
        row.price_minor,
        row.currency,
        row.track_stock,
        row.is_default,
      ]
        .map(literal)
        .join(", ")} FROM products WHERE legacy_id = ${literal(row.product_legacy_id)};`,
    );
  }
  out.push("");
  for (const row of plan.images) {
    out.push(
      `INSERT INTO product_images (product_id, url, alt, sort_order) SELECT id, ${[row.url, row.alt, row.sort_order]
        .map(literal)
        .join(", ")} FROM products WHERE legacy_id = ${literal(row.product_legacy_id)};`,
    );
  }
  out.push("");
  for (const row of plan.inventory) {
    out.push(
      `INSERT INTO inventory (variant_id, on_hand) SELECT id, ${literal(row.on_hand)} FROM product_variants WHERE sku = ${literal(row.sku)};`,
    );
    out.push(
      `INSERT INTO inventory_movements (variant_id, delta_on_hand, reason, actor, note) SELECT id, ${literal(row.on_hand)}, 'initial_count', 'seed', 'Stock provisorio de ensayo' FROM product_variants WHERE sku = ${literal(row.sku)};`,
    );
  }
  out.push("");
  return out.join("\n");
}
