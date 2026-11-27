import type { QueryFn } from "../customers/repository.ts";
import { AdminDataError, type Admin } from "./repository.ts";
import { MAX_PRICE_MINOR } from "./validation.ts";
import { planVariants, type OptionDefinition, type VariantOptions } from "./variants.ts";

export type AdminVariant = {
  id: string;
  sku: string;
  options: VariantOptions;
  priceMinor: number | null;
  active: boolean;
  isDefault: boolean;
  trackStock: boolean;
  onHand: number;
  reserved: number;
};

type VariantRow = {
  id: string;
  sku: string;
  options: VariantOptions;
  price_minor: string | number | null;
  active: boolean;
  is_default: boolean;
  track_stock: boolean;
  on_hand: number | null;
  reserved: number | null;
};

const toVariant = (row: VariantRow): AdminVariant => ({
  id: row.id,
  sku: row.sku,
  options: row.options ?? {},
  priceMinor: row.price_minor === null ? null : Number(row.price_minor),
  active: row.active,
  isDefault: row.is_default,
  trackStock: row.track_stock,
  onHand: row.on_hand ?? 0,
  reserved: row.reserved ?? 0,
});

const PRODUCT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SKU = /^[A-Z0-9][A-Z0-9-]{1,39}$/;

const audit = "INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)";

/**
 * Variants of a product. Defining options (Talle: S, M, L…) creates one variant
 * per combination; removed combinations are deactivated, never deleted, because
 * stock movements reference them.
 */
export function createVariantRepository(sql: QueryFn) {
  async function listVariants(productId: string): Promise<AdminVariant[]> {
    if (!PRODUCT_ID.test(productId)) throw new AdminDataError("not_found", "El producto no existe.");
    const rows = (await sql.query(
      `SELECT v.id, v.sku, v.options, v.price_minor, v.active, v.is_default, v.track_stock, i.on_hand, i.reserved
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN inventory i ON i.variant_id = v.id
       WHERE p.legacy_id = $1
       ORDER BY v.active DESC, v.sort_order, v.sku`,
      [productId],
    )) as VariantRow[];
    return rows.map(toVariant);
  }

  /** Variant, product and price-on-request flag for many SKUs in one query (bulk API, CSV). */
  async function findBySkus(skus: readonly string[]): Promise<Map<string, { productId: string; variant: AdminVariant; requiresQuote: boolean }>> {
    const valid = [...new Set(skus.filter((sku) => SKU.test(sku)))];
    if (!valid.length) return new Map();
    const rows = (await sql.query(
      `SELECT v.id, v.sku, v.options, v.price_minor, v.active, v.is_default, v.track_stock, i.on_hand, i.reserved,
              p.legacy_id, p.requires_quote
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN inventory i ON i.variant_id = v.id
       WHERE v.sku = ANY ($1::text[])`,
      [valid],
    )) as (VariantRow & { legacy_id: string; requires_quote: boolean })[];
    return new Map(rows.map((row) => [row.sku, { productId: row.legacy_id, variant: toVariant(row), requiresQuote: row.requires_quote }]));
  }

  return {
    listVariants,
    findBySkus,

    /** Active variants of many products in one query (price rules over a scope). */
    async listActiveVariantsOf(productIds: readonly string[]): Promise<Map<string, AdminVariant[]>> {
      const valid = [...new Set(productIds.filter((id) => PRODUCT_ID.test(id)))];
      const byProduct = new Map<string, AdminVariant[]>(valid.map((id) => [id, []]));
      if (!valid.length) return byProduct;
      const rows = (await sql.query(
        `SELECT v.id, v.sku, v.options, v.price_minor, v.active, v.is_default, v.track_stock, i.on_hand, i.reserved, p.legacy_id
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         LEFT JOIN inventory i ON i.variant_id = v.id
         WHERE p.legacy_id = ANY ($1::text[]) AND v.active
         ORDER BY p.legacy_id, v.sort_order, v.sku`,
        [valid],
      )) as (VariantRow & { legacy_id: string })[];
      for (const row of rows) byProduct.get(row.legacy_id)?.push(toVariant(row));
      return byProduct;
    },

    /**
     * Sets many prices in one statement, each with its audit entry (same shape as
     * updateVariant). The caller validated every price; unchanged ones are skipped.
     */
    async setPrices(actor: Admin, changes: { productId: string; variantId: string; sku: string; before: number | null; priceMinor: number }[]): Promise<void> {
      const due = changes.filter((change) => change.before !== change.priceMinor);
      if (!due.length) return;
      await sql.query(
        `WITH input AS (
           SELECT * FROM unnest($1::uuid[], $2::bigint[], $3::text[], $4::jsonb[]) AS t(variant_id, price_minor, product_id, changes)
         ),
         updated AS (
           UPDATE product_variants v SET price_minor = input.price_minor, updated_at = now()
           FROM input WHERE v.id = input.variant_id AND v.track_stock
           RETURNING v.sku, input.product_id, input.changes
         )
         ${audit}
         SELECT $5, $6, 'variant.update', 'product', product_id, jsonb_build_object('sku', sku) || changes FROM updated`,
        [
          due.map((change) => change.variantId),
          due.map((change) => change.priceMinor),
          due.map((change) => change.productId),
          due.map((change) => JSON.stringify({ priceMinor: { before: change.before, after: change.priceMinor } })),
          actor.authUserId,
          actor.email,
        ],
      );
    },

    /** Creates or re-shapes the variants from the option definitions (see planVariants). */
    async configureOptions(actor: Admin, productId: string, definitions: OptionDefinition[]): Promise<AdminVariant[]> {
      if (!PRODUCT_ID.test(productId)) throw new AdminDataError("not_found", "El producto no existe.");
      const [product] = (await sql.query("SELECT option_names, requires_quote FROM products WHERE legacy_id = $1", [productId])) as {
        option_names: string[];
        requires_quote: boolean;
      }[];
      if (!product) throw new AdminDataError("not_found", "El producto no existe.");
      const current = await listVariants(productId);
      const base = current.find((variant) => variant.isDefault) ?? current[0];
      const plan = planVariants(product.option_names, definitions, current, base.sku);

      await sql.query(
        `WITH product AS (
           UPDATE products SET option_names = $2::text[], updated_at = now() WHERE legacy_id = $1 RETURNING id
         ),
         updated AS (
           UPDATE product_variants v SET options = u.options, active = u.active, sort_order = u.sort_order, updated_at = now()
           FROM jsonb_to_recordset($3::jsonb) AS u(id uuid, options jsonb, active boolean, sort_order int)
           WHERE v.id = u.id
           RETURNING v.id
         ),
         inserted AS (
           INSERT INTO product_variants (product_id, sku, options, price_minor, track_stock, is_default, active, sort_order)
           SELECT product.id, n.sku, n.options, $5::bigint, NOT $6::boolean, false, true, n.sort_order
           FROM product, jsonb_to_recordset($4::jsonb) AS n(sku text, options jsonb, sort_order int)
           RETURNING id, track_stock
         ),
         stock AS (
           INSERT INTO inventory (variant_id, on_hand) SELECT id, 0 FROM inserted WHERE track_stock RETURNING variant_id
         )
         ${audit}
         SELECT $7, $8, 'variant.options', 'product', $1,
                jsonb_build_object('options', $9::jsonb, 'created', (SELECT count(*) FROM inserted),
                                   'deactivated', $10::int)
         FROM product`,
        [
          productId,
          plan.names,
          JSON.stringify(plan.updates.map((u) => ({ id: u.id, options: u.options, active: u.active, sort_order: u.sortOrder }))),
          JSON.stringify(plan.inserts.map((n) => ({ sku: n.sku, options: n.options, sort_order: n.sortOrder }))),
          product.requires_quote ? null : base.priceMinor,
          product.requires_quote,
          actor.authUserId,
          actor.email,
          JSON.stringify(definitions),
          plan.updates.filter((update) => !update.active && current.find((variant) => variant.id === update.id)?.active).length,
        ],
      );
      return listVariants(productId);
    },

    /**
     * Price and visibility of one variant. At least one variant must stay active,
     * otherwise the product would silently disappear from the store.
     */
    async updateVariant(actor: Admin, productId: string, variantId: string, input: { priceMinor: number | null; active: boolean }) {
      if (!UUID.test(variantId)) throw new AdminDataError("not_found", "La variante no existe.");
      const variants = await listVariants(productId);
      const variant = variants.find((candidate) => candidate.id === variantId);
      if (!variant) throw new AdminDataError("not_found", "La variante no existe.");
      if (!input.active && !variants.some((other) => other.id !== variantId && other.active)) {
        throw new AdminDataError("conflict", "Tiene que quedar al menos una variante activa (o archivá el producto).");
      }
      const priceMinor = variant.trackStock ? input.priceMinor : null;
      if (variant.trackStock && (priceMinor === null || priceMinor <= 0 || priceMinor > MAX_PRICE_MINOR)) {
        throw new AdminDataError("conflict", "El precio debe ser mayor a $ 0 y hasta $ 10.000.000.");
      }
      const changes: Record<string, { before: unknown; after: unknown }> = {};
      if (variant.priceMinor !== priceMinor) changes.priceMinor = { before: variant.priceMinor, after: priceMinor };
      if (variant.active !== input.active) changes.active = { before: variant.active, after: input.active };
      if (!Object.keys(changes).length) return variant;
      await sql.query(
        `WITH updated AS (
           UPDATE product_variants SET price_minor = $2::bigint, active = $3, updated_at = now() WHERE id = $1 RETURNING sku
         )
         ${audit}
         SELECT $4, $5, 'variant.update', 'product', $6, jsonb_build_object('sku', sku) || $7::jsonb FROM updated`,
        [variantId, priceMinor, input.active, actor.authUserId, actor.email, productId, JSON.stringify(changes)],
      );
      return (await listVariants(productId)).find((candidate) => candidate.id === variantId)!;
    },

    /** Finds the product and variant behind a SKU (API price and stock updates). */
    async findBySku(sku: string): Promise<{ productId: string; variant: AdminVariant; requiresQuote: boolean } | null> {
      if (!SKU.test(sku)) return null;
      const [row] = (await sql.query(
        `SELECT p.legacy_id, p.requires_quote FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.sku = $1`,
        [sku],
      )) as { legacy_id: string; requires_quote: boolean }[];
      if (!row) return null;
      const variant = (await listVariants(row.legacy_id)).find((candidate) => candidate.sku === sku)!;
      return { productId: row.legacy_id, variant, requiresQuote: row.requires_quote };
    },
  };
}

export type VariantRepository = ReturnType<typeof createVariantRepository>;
