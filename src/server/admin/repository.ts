import { randomBytes } from "node:crypto";
import type { QueryFn } from "../customers/repository.ts";
import { LOW_STOCK, PAGE_SIZE, type ProductSearch } from "./product-search.ts";
import type { ProductCreateInput, ProductStatus, ProductUpdateInput, StockCountInput } from "./validation.ts";

export type AdminRole = "owner" | "editor";
export type Admin = { authUserId: string; email: string; role: AdminRole };

export type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  theme: string;
  tags: string[];
  details: string[];
  featured: boolean;
  catalogCode: string | null;
  sku: string;
  status: ProductStatus;
  requiresQuote: boolean;
  priceMinor: number | null;
  trackStock: boolean;
  onHand: number;
  reserved: number;
  /** First image, or the category image when the product has none. */
  coverUrl: string;
  /** Latest change to the product, its price or its stock. */
  updatedAt: Date;
  /** Option names (e.g. ["Talle"]); empty for single-variant products. */
  optionNames: string[];
  variantCount: number;
};

export type StockMovement = { id: string; sku: string; deltaOnHand: number; reason: string; actor: string; note: string; createdAt: Date };
export type AuditEntry = {
  id: string;
  actorEmail: string;
  action: string;
  entity: string;
  entityId: string;
  changes: Record<string, unknown>;
  createdAt: Date;
};

export type AuditEntity = "product" | "inventory" | "admin" | "category" | "integration" | "shipping" | "point" | "home" | "settings" | "promotion";
const AUDIT_ENTITY_ID = /^[a-z0-9-]{1,40}$/;

export type ProductSearchResult = { items: AdminProduct[]; total: number; page: number; pageSize: number; pages: number };

/** Option counts for the filter sidebar, over the whole catalog. */
export type ProductFacets = {
  total: number;
  status: Record<ProductStatus, number>;
  stock: { con: number; sin: number; bajo: number; pedido: number };
  images: { con: number; sin: number };
  featured: { si: number; no: number };
  categories: Record<string, number>;
  themes: Record<string, number>;
};

/** Whitelisted ORDER BY clauses; user input never reaches SQL text. */
const SORTS: Record<ProductSearch["sort"], string> = {
  orden: "p.sort_order, p.name",
  nombre: "p.name, p.legacy_id",
  "precio-asc": "v.price_minor ASC NULLS LAST, p.name",
  "precio-desc": "v.price_minor DESC NULLS LAST, p.name",
  "stock-asc": "v.track_stock DESC, (coalesce(i.on_hand, 0) - coalesce(i.reserved, 0)), p.name",
  modificado: "p.updated_at DESC, p.legacy_id",
};

const AVAILABLE = "(coalesce(i.on_hand, 0) - coalesce(i.reserved, 0))";
const HAS_IMAGES = "EXISTS (SELECT 1 FROM product_images im WHERE im.product_id = p.id)";

type AdminDataErrorCode = "not_found" | "untracked" | "below_reserved" | "conflict";

export class AdminDataError extends Error {
  readonly code: AdminDataErrorCode;

  constructor(code: AdminDataErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

type ProductRow = {
  legacy_id: string;
  name: string;
  slug: string;
  description: string;
  category_id: string;
  theme: string;
  tags: string[];
  details: string[];
  featured: boolean;
  catalog_code: string | null;
  sku: string;
  status: ProductStatus;
  requires_quote: boolean;
  price_minor: string | number | null;
  track_stock: boolean;
  on_hand: number | null;
  reserved: number | null;
  cover_url: string | null;
  updated_at: Date;
  option_names: string[];
  variant_count: number;
};

const toProduct = (row: ProductRow): AdminProduct => ({
  id: row.legacy_id,
  name: row.name,
  slug: row.slug,
  description: row.description,
  categoryId: row.category_id,
  theme: row.theme,
  tags: row.tags,
  details: row.details,
  featured: row.featured,
  catalogCode: row.catalog_code,
  sku: row.sku,
  status: row.status,
  requiresQuote: row.requires_quote,
  // bigint arrives as a string; prices stay far below Number.MAX_SAFE_INTEGER.
  priceMinor: row.price_minor === null ? null : Number(row.price_minor),
  trackStock: row.track_stock,
  onHand: row.on_hand ?? 0,
  reserved: row.reserved ?? 0,
  coverUrl: row.cover_url || "/demo/categories/stickers.webp",
  updatedAt: new Date(row.updated_at),
  optionNames: row.option_names,
  variantCount: row.variant_count,
});

/** Stock summed over the product's active variants (one row per product). */
const ACTIVE_STOCK = `
  SELECT sum(inv.on_hand)::int AS on_hand, sum(inv.reserved)::int AS reserved, max(inv.updated_at) AS updated_at
  FROM product_variants pv JOIN inventory inv ON inv.variant_id = pv.id
  WHERE pv.product_id = p.id AND pv.active`;

const SELECT_PRODUCTS = `
  SELECT p.legacy_id, p.name, p.slug, p.description, p.category_id, p.theme, p.tags, p.details, p.featured,
         p.catalog_code, v.sku, p.status, p.requires_quote, v.price_minor, v.track_stock, i.on_hand, i.reserved,
         p.option_names,
         (SELECT count(*)::int FROM product_variants pv WHERE pv.product_id = p.id AND pv.active) AS variant_count,
         coalesce(
           (SELECT im.url FROM product_images im WHERE im.product_id = p.id ORDER BY im.sort_order LIMIT 1),
           nullif((SELECT c.image_url FROM categories c WHERE c.id = p.category_id), '')
         ) AS cover_url,
         greatest(p.updated_at, v.updated_at, coalesce(i.updated_at, p.updated_at)) AS updated_at
  FROM products p
  JOIN product_variants v ON v.product_id = p.id AND v.is_default
  LEFT JOIN LATERAL (${ACTIVE_STOCK}) i ON true`;

/** Public product ids look like p13, c088 or x1a2b3c4d; anything else never reaches SQL. */
const PRODUCT_ID = /^[a-z0-9]{1,20}$/;

function assertProductId(productId: string) {
  if (!PRODUCT_ID.test(productId)) throw new AdminDataError("not_found", "El producto no existe.");
}

/** Public ids for new products: "x" + 8 base-36 characters (never collides with p13/c088). */
const newProductId = () => `x${[...randomBytes(8)].map((byte) => (byte % 36).toString(36)).join("")}`;

/** Escapes LIKE wildcards so a search for "50%" means the literal text. */
const likePattern = (value: string) => `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

type PgError = { code?: string; constraint?: string; detail?: string } | null;
const isCheckViolation = (error: unknown) => (error as PgError)?.code === "23514";

/** Unique violations (slug, SKU, catalog code) become messages people can act on. */
function conflictError(error: unknown): AdminDataError | null {
  const pg = error as PgError;
  if (pg?.code === "23503" && `${pg.constraint ?? ""} ${pg.detail ?? ""}`.includes("category")) {
    return new AdminDataError("not_found", "La categoría elegida no existe.");
  }
  if (pg?.code !== "23505") return null;
  const where = `${pg.constraint ?? ""} ${pg.detail ?? ""}`;
  if (where.includes("slug")) return new AdminDataError("conflict", "Ya existe un producto con esa URL (slug).");
  if (where.includes("sku")) return new AdminDataError("conflict", "Ya existe un producto con ese SKU.");
  if (where.includes("catalog_code")) return new AdminDataError("conflict", "Ya existe un producto con ese código de catálogo.");
  return new AdminDataError("conflict", "Ya existe un producto con esos datos.");
}

const EDITABLE = [
  "name",
  "slug",
  "description",
  "categoryId",
  "theme",
  "tags",
  "details",
  "featured",
  "catalogCode",
  "status",
  "priceMinor",
] as const satisfies readonly (keyof ProductUpdateInput & keyof AdminProduct)[];

/** Only the fields that actually change, as { field: { before, after } }. */
export function productChanges(current: AdminProduct, next: ProductUpdateInput) {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of EDITABLE) {
    if (JSON.stringify(current[key]) !== JSON.stringify(next[key])) changes[key] = { before: current[key], after: next[key] };
  }
  return changes;
}

/**
 * Catalog administration over the 0001/0003/0004 schema. Every change is a
 * single SQL statement (data-modifying CTEs), so the change, its stock movement
 * and its audit entry are committed together or not at all.
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

    getProduct,

    /** The API identifies products by SKU (stable and readable). */
    async getProductBySku(sku: string): Promise<AdminProduct> {
      if (!/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(sku)) throw new AdminDataError("not_found", "El producto no existe.");
      const [row] = (await sql.query(
        `${SELECT_PRODUCTS} WHERE EXISTS (SELECT 1 FROM product_variants sv WHERE sv.product_id = p.id AND sv.sku = $1)`,
        [sku],
      )) as ProductRow[];
      if (!row) throw new AdminDataError("not_found", "El producto no existe.");
      return toProduct(row);
    },

    /** Filtered, sorted and paginated list for the admin; the database does the work. */
    async searchProducts(search: ProductSearch): Promise<ProductSearchResult> {
      const params = [
        search.query || null,
        search.query ? likePattern(search.query) : null,
        search.status ?? null,
        search.categoryId ?? null,
        search.theme ?? null,
        search.stock ?? null,
        search.images ?? null,
        search.featured ?? null,
        LOW_STOCK,
        search.updatedSince?.toISOString() ?? null,
      ];
      const pageSize = Math.min(Math.max(search.pageSize ?? PAGE_SIZE, 1), 200);
      const where = `
        WHERE ($1::text IS NULL OR p.name ILIKE $2 OR EXISTS (SELECT 1 FROM product_variants sv WHERE sv.product_id = p.id AND sv.sku ILIKE $2) OR p.catalog_code = $1 OR $1 = ANY (p.tags))
          AND ($3::text IS NULL OR p.status = $3)
          AND ($4::text IS NULL OR p.category_id = $4)
          AND ($5::text IS NULL OR p.theme = $5)
          AND ($6::text IS NULL
               OR ($6 = 'pedido' AND NOT v.track_stock)
               OR ($6 = 'con' AND v.track_stock AND ${AVAILABLE} > 0)
               OR ($6 = 'sin' AND v.track_stock AND ${AVAILABLE} <= 0)
               OR ($6 = 'bajo' AND v.track_stock AND ${AVAILABLE} BETWEEN 1 AND $9::int))
          AND ($7::text IS NULL OR ($7 = 'con') = ${HAS_IMAGES})
          AND ($8::text IS NULL OR ($8 = 'si') = p.featured)
          AND ($10::timestamptz IS NULL OR greatest(p.updated_at, v.updated_at, coalesce(i.updated_at, p.updated_at)) >= $10::timestamptz)`;
      const [countRow] = (await sql.query(
        `SELECT count(*)::int AS total FROM products p
         JOIN product_variants v ON v.product_id = p.id AND v.is_default
         LEFT JOIN LATERAL (${ACTIVE_STOCK}) i ON true ${where}`,
        params,
      )) as { total: number }[];
      const total = countRow?.total ?? 0;
      const pages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(search.page, pages);
      const rows = (await sql.query(
        `${SELECT_PRODUCTS} ${where} ORDER BY ${SORTS[search.sort]} LIMIT $11::int OFFSET $12::int`,
        [...params, pageSize, (page - 1) * pageSize],
      )) as ProductRow[];
      return { items: rows.map(toProduct), total, page, pageSize, pages };
    },

    async productFacets(): Promise<ProductFacets> {
      const [[summary], categories, themes] = (await Promise.all([
        sql.query(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE p.status = 'active')::int AS active,
                  count(*) FILTER (WHERE p.status = 'draft')::int AS draft,
                  count(*) FILTER (WHERE p.status = 'archived')::int AS archived,
                  count(*) FILTER (WHERE v.track_stock AND ${AVAILABLE} > 0)::int AS stock_con,
                  count(*) FILTER (WHERE v.track_stock AND ${AVAILABLE} <= 0)::int AS stock_sin,
                  count(*) FILTER (WHERE v.track_stock AND ${AVAILABLE} BETWEEN 1 AND $1::int)::int AS stock_bajo,
                  count(*) FILTER (WHERE NOT v.track_stock)::int AS stock_pedido,
                  count(*) FILTER (WHERE ${HAS_IMAGES})::int AS images_con,
                  count(*) FILTER (WHERE NOT ${HAS_IMAGES})::int AS images_sin,
                  count(*) FILTER (WHERE p.featured)::int AS featured_si
           FROM products p
           JOIN product_variants v ON v.product_id = p.id AND v.is_default
           LEFT JOIN LATERAL (${ACTIVE_STOCK}) i ON true`,
          [LOW_STOCK],
        ),
        sql.query("SELECT category_id AS key, count(*)::int AS n FROM products GROUP BY category_id"),
        sql.query("SELECT theme AS key, count(*)::int AS n FROM products GROUP BY theme"),
      ])) as [Record<string, number>[], { key: string; n: number }[], { key: string; n: number }[]];
      const byKey = (rows: { key: string; n: number }[]) => Object.fromEntries(rows.map((row) => [row.key, row.n]));
      return {
        total: summary.total,
        status: { active: summary.active, draft: summary.draft, archived: summary.archived },
        stock: { con: summary.stock_con, sin: summary.stock_sin, bajo: summary.stock_bajo, pedido: summary.stock_pedido },
        images: { con: summary.images_con, sin: summary.images_sin },
        featured: { si: summary.featured_si, no: summary.total - summary.featured_si },
        categories: byKey(categories),
        themes: byKey(themes),
      };
    },

    /**
     * Updates content, price and status in one statement with an audit entry
     * listing only what changed. Saving without changes writes nothing.
     */
    async updateProduct(actor: Admin, productId: string, input: ProductUpdateInput): Promise<AdminProduct> {
      const current = await getProduct(productId);
      const next = { ...input, priceMinor: current.requiresQuote ? null : input.priceMinor };
      const changes = productChanges(current, next);
      if (!Object.keys(changes).length) return current;
      try {
        await sql.query(
          `WITH target AS (
             SELECT p.id, v.id AS variant_id FROM products p
             JOIN product_variants v ON v.product_id = p.id AND v.is_default
             WHERE p.legacy_id = $1
           ),
           product_update AS (
             UPDATE products SET name = $2, slug = $3, description = $4, category_id = $5, theme = $6,
                    tags = $7::text[], details = $8::text[], featured = $9, catalog_code = $10, status = $11,
                    updated_at = now()
             FROM target WHERE products.id = target.id
             RETURNING products.id
           ),
           variant_update AS (
             UPDATE product_variants SET price_minor = $12::bigint, updated_at = now() FROM target
             WHERE product_variants.id = target.variant_id AND product_variants.price_minor IS DISTINCT FROM $12::bigint
             RETURNING product_variants.id
           )
           INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
           SELECT $13, $14, 'product.update', 'product', $1, $15::jsonb FROM target`,
          [
            productId,
            next.name,
            next.slug,
            next.description,
            next.categoryId,
            next.theme,
            next.tags,
            next.details,
            next.featured,
            next.catalogCode,
            next.status,
            next.priceMinor,
            actor.authUserId,
            actor.email,
            JSON.stringify(changes),
          ],
        );
      } catch (error) {
        throw conflictError(error) ?? error;
      }
      return getProduct(productId);
    },

    /**
     * Creates a product with its default variant, the initial stock count (as an
     * inventory movement) and an audit entry, all in one statement.
     */
    async createProduct(actor: Admin, input: ProductCreateInput): Promise<AdminProduct> {
      const productId = newProductId();
      const sku = input.sku ?? `SUB-${productId.toUpperCase()}`;
      try {
        await sql.query(
          `WITH product AS (
             INSERT INTO products (legacy_id, slug, name, description, category_id, catalog_code, requires_quote,
                                   status, tags, theme, featured, details, sort_order)
             SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12::text[],
                    coalesce((SELECT max(sort_order) FROM products), 0) + 1
             RETURNING id
           ),
           variant AS (
             INSERT INTO product_variants (product_id, sku, price_minor, track_stock, is_default)
             SELECT id, $13, $14::bigint, NOT $7::boolean, true FROM product
             RETURNING id, track_stock
           ),
           stock AS (
             INSERT INTO inventory (variant_id, on_hand) SELECT id, $15::int FROM variant WHERE track_stock
             RETURNING variant_id
           ),
           movement AS (
             INSERT INTO inventory_movements (variant_id, delta_on_hand, reason, actor, note)
             SELECT variant_id, $15::int, 'initial_count', $17, 'Alta del producto' FROM stock WHERE $15::int > 0
             RETURNING id
           )
           INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
           SELECT $16, $17, 'product.create', 'product', $1, $18::jsonb FROM product`,
          [
            productId,
            input.slug,
            input.name,
            input.description,
            input.categoryId,
            input.catalogCode,
            input.requiresQuote,
            input.status,
            input.tags,
            input.theme,
            input.featured,
            input.details,
            sku,
            input.requiresQuote ? null : input.priceMinor,
            input.initialStock,
            actor.authUserId,
            actor.email,
            JSON.stringify({ ...input, sku }),
          ],
        );
      } catch (error) {
        throw conflictError(error) ?? error;
      }
      return getProduct(productId);
    },

    /**
     * Records a physical count: on_hand becomes the counted quantity, and the
     * difference is logged as a stock movement plus an audit entry.
     */
    /** `variantSku` targets one variant (size, color…); without it, the default variant. */
    async countStock(actor: Admin, productId: string, input: StockCountInput, variantSku?: string): Promise<AdminProduct> {
      assertProductId(productId);
      const [variant] = (await sql.query(
        `SELECT v.sku, v.track_stock, coalesce(i.reserved, 0) AS reserved
         FROM products p
         JOIN product_variants v ON v.product_id = p.id AND (CASE WHEN $2::text IS NULL THEN v.is_default ELSE v.sku = $2 END)
         LEFT JOIN inventory i ON i.variant_id = v.id
         WHERE p.legacy_id = $1`,
        [productId, variantSku ?? null],
      )) as { sku: string; track_stock: boolean; reserved: number }[];
      if (!variant) throw new AdminDataError("not_found", variantSku ? "La variante no existe." : "El producto no existe.");
      if (!variant.track_stock) throw new AdminDataError("untracked", "Este producto se hace a pedido y no lleva stock.");
      if (input.onHand < variant.reserved) {
        throw new AdminDataError("below_reserved", `Hay ${variant.reserved} unidades reservadas: el stock no puede ser menor.`);
      }
      try {
        await sql.query(
          `WITH target AS (
             SELECT v.id AS variant_id, coalesce(i.on_hand, 0) AS previous
             FROM products p
             JOIN product_variants v ON v.product_id = p.id AND v.sku = $7 AND v.track_stock
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
                  jsonb_build_object('before', previous, 'after', $2::int, 'reason', $3::text, 'note', $4::text, 'sku', $7::text)
           FROM target WHERE previous <> $2::int`,
          [productId, input.onHand, input.reason, input.note, actor.email, actor.authUserId, variant.sku],
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
        `SELECT m.id, v.sku, m.delta_on_hand, m.reason, m.actor, m.note, m.created_at
         FROM inventory_movements m
         JOIN product_variants v ON v.id = m.variant_id
         JOIN products p ON p.id = v.product_id
         WHERE p.legacy_id = $1
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT $2`,
        [productId, limit],
      )) as { id: string | number; sku: string; delta_on_hand: number; reason: string; actor: string; note: string; created_at: Date }[];
      return rows.map((row) => ({
        id: String(row.id),
        sku: row.sku,
        deltaOnHand: row.delta_on_hand,
        reason: row.reason,
        actor: row.actor,
        note: row.note,
        createdAt: new Date(row.created_at),
      }));
    },

    /** `entity` narrows ids shared by different kinds (a product and a category could both be "stickers"). */
    /** `before` pages back: entries older than that id (the activity page's "ver anteriores"). */
    async listAudit(options: { entity?: AuditEntity; entityId?: string; limit?: number; before?: string } = {}): Promise<AuditEntry[]> {
      if (options.entityId && !AUDIT_ENTITY_ID.test(options.entityId)) return [];
      const rows = (await sql.query(
        `SELECT id, actor_email, action, entity, entity_id, changes, created_at
         FROM audit_logs
         WHERE ($1::text IS NULL OR entity_id = $1) AND ($3::text IS NULL OR entity = $3) AND ($4::bigint IS NULL OR id < $4)
         ORDER BY id DESC
         LIMIT $2`,
        [options.entityId ?? null, options.limit ?? 50, options.entity ?? null, options.before && /^\d{1,18}$/.test(options.before) ? options.before : null],
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
