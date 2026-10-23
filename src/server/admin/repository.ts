import type { QueryFn } from "../customers/repository.ts";
import type { ProductStatus, ProductUpdateInput, StockCountInput } from "./validation.ts";

export type AdminRole = "owner" | "editor";
export type Admin = { authUserId: string; email: string; role: AdminRole };

export type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  catalogCode: string | null;
  sku: string;
  status: ProductStatus;
  requiresQuote: boolean;
  priceMinor: number | null;
  trackStock: boolean;
  onHand: number;
  reserved: number;
};

export type StockMovement = { id: string; deltaOnHand: number; reason: string; actor: string; note: string; createdAt: Date };
export type AuditEntry = {
  id: string;
  actorEmail: string;
  action: string;
  entity: string;
  entityId: string;
  changes: Record<string, unknown>;
  createdAt: Date;
};

export type ProductFilter = { query?: string; status?: ProductStatus };

export class AdminDataError extends Error {
  readonly code: "not_found" | "untracked" | "below_reserved";

  constructor(code: "not_found" | "untracked" | "below_reserved", message: string) {
    super(message);
    this.code = code;
  }
}

type ProductRow = {
  legacy_id: string;
  name: string;
  slug: string;
  category_id: string;
  catalog_code: string | null;
  sku: string;
  status: ProductStatus;
  requires_quote: boolean;
  price_minor: string | number | null;
  track_stock: boolean;
  on_hand: number | null;
  reserved: number | null;
};

const toProduct = (row: ProductRow): AdminProduct => ({
  id: row.legacy_id,
  name: row.name,
  slug: row.slug,
  categoryId: row.category_id,
  catalogCode: row.catalog_code,
  sku: row.sku,
  status: row.status,
  requiresQuote: row.requires_quote,
  // bigint arrives as a string; prices stay far below Number.MAX_SAFE_INTEGER.
  priceMinor: row.price_minor === null ? null : Number(row.price_minor),
  trackStock: row.track_stock,
  onHand: row.on_hand ?? 0,
  reserved: row.reserved ?? 0,
});

const SELECT_PRODUCTS = `
  SELECT p.legacy_id, p.name, p.slug, p.category_id, p.catalog_code, v.sku, p.status, p.requires_quote,
         v.price_minor, v.track_stock, i.on_hand, i.reserved
  FROM products p
  JOIN product_variants v ON v.product_id = p.id AND v.is_default
  LEFT JOIN inventory i ON i.variant_id = v.id`;

/** Public product ids look like p13 or c088; anything else never reaches SQL. */
const PRODUCT_ID = /^[a-z0-9]{1,20}$/;

function assertProductId(productId: string) {
  if (!PRODUCT_ID.test(productId)) throw new AdminDataError("not_found", "El producto no existe.");
}

/** Escapes LIKE wildcards so a search for "50%" means the literal text. */
const likePattern = (value: string) => `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

const isCheckViolation = (error: unknown) => (error as { code?: string } | null)?.code === "23514";

/**
 * Catalog administration over the 0001/0003 schema. Every change is a single
 * SQL statement (data-modifying CTEs), so the change, its stock movement and
 * its audit entry are committed together or not at all.
 */
export function createAdminRepository(sql: QueryFn) {
  async function getProduct(productId: string): Promise<AdminProduct> {
    assertProductId(productId);
    const [row] = (await sql.query(`${SELECT_PRODUCTS} WHERE p.legacy_id = $1`, [productId])) as ProductRow[];
    if (!row) throw new AdminDataError("not_found", "El producto no existe.");
    return toProduct(row);
  }

  return {
    async findAdmin(authUserId: string): Promise<Admin | null> {
      const [row] = (await sql.query("SELECT auth_user_id, email, role FROM admin_users WHERE auth_user_id = $1", [
        authUserId,
      ])) as { auth_user_id: string; email: string; role: AdminRole }[];
      return row ? { authUserId: row.auth_user_id, email: row.email, role: row.role } : null;
    },

    /** Grants (or changes) a role. Used by scripts/admin-grant.mjs, never from the web. */
    async grantAdmin(target: { authUserId: string; email: string }, role: AdminRole, grantedBy: string): Promise<void> {
      await sql.query(
        `WITH upsert AS (
           INSERT INTO admin_users (auth_user_id, email, role, granted_by) VALUES ($1, $2, $3, $4)
           ON CONFLICT (auth_user_id) DO UPDATE SET role = EXCLUDED.role, email = EXCLUDED.email
           RETURNING auth_user_id
         )
         INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
         SELECT 'script', $4, 'admin.grant', 'admin', auth_user_id, jsonb_build_object('email', $2::text, 'role', $3::text)
         FROM upsert`,
        [target.authUserId, target.email, role, grantedBy],
      );
    },

    async listProducts(filter: ProductFilter = {}): Promise<AdminProduct[]> {
      const query = filter.query?.trim().slice(0, 60) || null;
      const rows = (await sql.query(
        `${SELECT_PRODUCTS}
         WHERE ($1::text IS NULL OR p.name ILIKE $2 OR v.sku ILIKE $2 OR p.catalog_code = $1)
           AND ($3::text IS NULL OR p.status = $3)
         ORDER BY p.category_id, p.name
         LIMIT 300`,
        [query, query && likePattern(query), filter.status ?? null],
      )) as ProductRow[];
      return rows.map(toProduct);
    },

    getProduct,

    /** Updates price and status; writes an audit entry only when something changed. */
    async updateProduct(actor: Admin, productId: string, input: ProductUpdateInput): Promise<AdminProduct> {
      const current = await getProduct(productId);
      await sql.query(
        `WITH target AS (
           SELECT p.id, v.id AS variant_id, p.status, v.price_minor
           FROM products p JOIN product_variants v ON v.product_id = p.id AND v.is_default
           WHERE p.legacy_id = $1
         ),
         product_update AS (
           UPDATE products SET status = $2, updated_at = now() FROM target
           WHERE products.id = target.id AND products.status <> $2 RETURNING products.id
         ),
         variant_update AS (
           UPDATE product_variants SET price_minor = $3, updated_at = now() FROM target
           WHERE product_variants.id = target.variant_id AND product_variants.price_minor IS DISTINCT FROM $3::bigint
           RETURNING product_variants.id
         )
         INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
         SELECT $4, $5, 'product.update', 'product', $1,
                jsonb_build_object(
                  'before', jsonb_build_object('status', status, 'priceMinor', price_minor),
                  'after', jsonb_build_object('status', $2::text, 'priceMinor', $3::bigint))
         FROM target
         WHERE status <> $2 OR price_minor IS DISTINCT FROM $3::bigint`,
        [productId, input.status, current.requiresQuote ? null : input.priceMinor, actor.authUserId, actor.email],
      );
      return getProduct(productId);
    },

    /**
     * Records a physical count: on_hand becomes the counted quantity, and the
     * difference is logged as a stock movement plus an audit entry.
     */
    async countStock(actor: Admin, productId: string, input: StockCountInput): Promise<AdminProduct> {
      const current = await getProduct(productId);
      if (!current.trackStock) throw new AdminDataError("untracked", "Este producto se hace a pedido y no lleva stock.");
      if (input.onHand < current.reserved) {
        throw new AdminDataError("below_reserved", `Hay ${current.reserved} unidades reservadas: el stock no puede ser menor.`);
      }
      try {
        await sql.query(
          `WITH target AS (
             SELECT v.id AS variant_id, coalesce(i.on_hand, 0) AS previous
             FROM products p
             JOIN product_variants v ON v.product_id = p.id AND v.is_default AND v.track_stock
             LEFT JOIN inventory i ON i.variant_id = v.id
             WHERE p.legacy_id = $1
           ),
           counted AS (
             INSERT INTO inventory (variant_id, on_hand) SELECT variant_id, $2::int FROM target
             ON CONFLICT (variant_id) DO UPDATE SET on_hand = EXCLUDED.on_hand, updated_at = now()
             RETURNING variant_id
           ),
           movement AS (
             INSERT INTO inventory_movements (variant_id, delta_on_hand, reason, actor, note)
             SELECT variant_id, $2::int - previous, $3::text, $5::text, $4::text FROM target WHERE previous <> $2::int
             RETURNING id
           )
           INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
           SELECT $6, $5::text, 'inventory.count', 'inventory', $1,
                  jsonb_build_object('before', previous, 'after', $2::int, 'reason', $3::text, 'note', $4::text)
           FROM target WHERE previous <> $2::int`,
          [productId, input.onHand, input.reason, input.note, actor.email, actor.authUserId],
        );
      } catch (error) {
        // A reservation may have landed between the read and the write.
        if (isCheckViolation(error)) throw new AdminDataError("below_reserved", "Hay unidades reservadas: el stock no puede ser menor.");
        throw error;
      }
      return getProduct(productId);
    },

    async listMovements(productId: string, limit = 20): Promise<StockMovement[]> {
      assertProductId(productId);
      const rows = (await sql.query(
        `SELECT m.id, m.delta_on_hand, m.reason, m.actor, m.note, m.created_at
         FROM inventory_movements m
         JOIN product_variants v ON v.id = m.variant_id AND v.is_default
         JOIN products p ON p.id = v.product_id
         WHERE p.legacy_id = $1
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT $2`,
        [productId, limit],
      )) as { id: string | number; delta_on_hand: number; reason: string; actor: string; note: string; created_at: Date }[];
      return rows.map((row) => ({
        id: String(row.id),
        deltaOnHand: row.delta_on_hand,
        reason: row.reason,
        actor: row.actor,
        note: row.note,
        createdAt: new Date(row.created_at),
      }));
    },

    async listAudit(options: { entityId?: string; limit?: number } = {}): Promise<AuditEntry[]> {
      if (options.entityId) assertProductId(options.entityId);
      const rows = (await sql.query(
        `SELECT id, actor_email, action, entity, entity_id, changes, created_at
         FROM audit_logs
         WHERE ($1::text IS NULL OR entity_id = $1)
         ORDER BY created_at DESC, id DESC
         LIMIT $2`,
        [options.entityId ?? null, options.limit ?? 50],
      )) as {
        id: string | number;
        actor_email: string;
        action: string;
        entity: string;
        entity_id: string;
        changes: Record<string, unknown>;
        created_at: Date;
      }[];
      return rows.map((row) => ({
        id: String(row.id),
        actorEmail: row.actor_email,
        action: row.action,
        entity: row.entity,
        entityId: row.entity_id,
        changes: row.changes,
        createdAt: new Date(row.created_at),
      }));
    },
  };
}

export type AdminRepository = ReturnType<typeof createAdminRepository>;
