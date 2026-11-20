import { MOCKUP_KINDS, type DesignStatus, type MockupKind } from "../../lib/designs/kinds.ts";
import { AdminDataError, type Admin } from "../admin/repository.ts";
import type { QueryFn } from "../customers/repository.ts";
import type { DesignInput } from "./validation.ts";

export type DesignImage = { imageUrl: string; sourcePath: string; width: number; height: number; opaque: boolean };

export type AdminDesign = DesignInput & {
  id: string;
  categoryLabel: string | null;
  status: DesignStatus;
  imageUrl: string;
  sourcePath: string;
  width: number | null;
  height: number | null;
  opaque: boolean;
  orderCount: number;
  updatedAt: Date;
};

export type MockupBase = { kind: MockupKind; productId: string; legacyId: string; name: string; status: string };

/** What the store needs to show a design; `productId` is the storefront id of each base product. */
export type StorefrontDesign = {
  id: string;
  slug: string;
  name: string;
  description: string;
  categoryId: string | null;
  categoryLabel: string | null;
  imageUrl: string;
  width: number;
  height: number;
  opaque: boolean;
  bases: { kind: MockupKind; productId: string }[];
};

type DesignRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category_id: string | null;
  category_label: string | null;
  status: DesignStatus;
  image_url: string;
  source_path: string;
  image_width: number | null;
  image_height: number | null;
  opaque: boolean;
  kinds: MockupKind[] | null;
  order_count: number;
  updated_at: Date;
};

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATALOG_ID = /^[a-z0-9-]{1,40}$/;
const KIND_ORDER = [...MOCKUP_KINDS];

const SELECT_DESIGNS = `
  SELECT d.id, d.slug, d.name, d.description, d.category_id, c.label AS category_label, d.status,
         d.image_url, d.source_path, d.image_width, d.image_height, d.opaque, d.updated_at,
         (SELECT array_agg(b.kind ORDER BY array_position($1::text[], b.kind)) FROM design_bases b WHERE b.design_id = d.id) AS kinds,
         (SELECT count(*) FROM order_items oi WHERE oi.design_id = d.id)::int AS order_count
  FROM designs d
  LEFT JOIN categories c ON c.id = d.category_id`;

const toDesign = (row: DesignRow): AdminDesign => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  categoryId: row.category_id,
  categoryLabel: row.category_label,
  kinds: row.kinds ?? [],
  status: row.status,
  imageUrl: row.image_url,
  sourcePath: row.source_path,
  width: row.image_width,
  height: row.image_height,
  opaque: row.opaque,
  orderCount: Number(row.order_count),
  updatedAt: row.updated_at,
});

const code = (error: unknown) => (error as { code?: string }).code;
const constraint = (error: unknown) => (error as { constraint?: string }).constraint ?? "";

/** Maps database refusals to messages the admin can act on. */
function asAdminError(error: unknown): never {
  if (code(error) === "23505" && constraint(error).includes("slug")) throw new AdminDataError("conflict", "Ya hay un diseño con esa dirección (slug).");
  if (code(error) === "23503" && constraint(error).includes("category")) throw new AdminDataError("not_found", "La categoría no existe.");
  throw error;
}

function assertId(id: string) {
  if (!ID.test(id)) throw new AdminDataError("not_found", "El diseño no existe.");
}

/**
 * Audit insert for a statement whose CTE returns `id`. `first` is the position of
 * the actor id; the actor email and the JSON changes follow it.
 */
const logDesign = (action: string, first: number) => `
  INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
  SELECT $${first}, $${first + 1}, '${action}', 'design', id::text, $${first + 2}::jsonb`;

/**
 * Design administration. A design is offered on one or more mockup kinds; each
 * kind sells through the product linked to it in `mockup_bases`. Every change
 * writes its audit entry in the same statement.
 */
export function createDesignRepository(sql: QueryFn) {
  async function getDesign(id: string): Promise<AdminDesign> {
    assertId(id);
    const [row] = (await sql.query(`${SELECT_DESIGNS} WHERE d.id = $2`, [KIND_ORDER, id])) as DesignRow[];
    if (!row) throw new AdminDataError("not_found", "El diseño no existe.");
    return toDesign(row);
  }

  return {
    getDesign,

    async listDesigns(filter: { status?: DesignStatus } = {}): Promise<AdminDesign[]> {
      const rows = (await sql.query(
        `${SELECT_DESIGNS} WHERE ($2::text IS NULL OR d.status = $2) ORDER BY d.sort_order, d.created_at DESC`,
        [KIND_ORDER, filter.status ?? null],
      )) as DesignRow[];
      return rows.map(toDesign);
    },

    /** Creates a draft and returns its id. */
    async createDesign(actor: Admin, input: DesignInput): Promise<string> {
      try {
        const [row] = (await sql.query(
          `WITH created AS (
             INSERT INTO designs (slug, name, description, category_id) VALUES ($1, $2, $3, $4) RETURNING id
           ), bases AS (
             INSERT INTO design_bases (design_id, kind) SELECT id, kind FROM created, unnest($5::text[]) AS kind
           ), logged AS (${logDesign("design.create", 6)} FROM created)
           SELECT id FROM created`,
          [input.slug, input.name, input.description, input.categoryId, input.kinds, actor.authUserId, actor.email, JSON.stringify(input)],
        )) as { id: string }[];
        return row.id;
      } catch (error) {
        asAdminError(error);
      }
    },

    /** Saves the data and base products. A published design must keep at least one. */
    async updateDesign(actor: Admin, id: string, input: DesignInput): Promise<void> {
      const current = await getDesign(id);
      if (current.status === "published" && !input.kinds.length) {
        throw new AdminDataError("conflict", "Un diseño publicado tiene que estar disponible en al menos un producto.");
      }
      const before = { name: current.name, slug: current.slug, description: current.description, categoryId: current.categoryId, kinds: current.kinds };
      try {
        await sql.query(
          `WITH updated AS (
             UPDATE designs SET slug = $2, name = $3, description = $4, category_id = $5, updated_at = now() WHERE id = $1 RETURNING id
           ), cleared AS (
             DELETE FROM design_bases WHERE design_id IN (SELECT id FROM updated) AND NOT (kind = ANY ($6::text[]))
           ), added AS (
             INSERT INTO design_bases (design_id, kind) SELECT id, kind FROM updated, unnest($6::text[]) AS kind ON CONFLICT DO NOTHING
           ), logged AS (${logDesign("design.update", 7)} FROM updated)
           SELECT id FROM updated`,
          [id, input.slug, input.name, input.description, input.categoryId, input.kinds, actor.authUserId, actor.email, JSON.stringify({ name: input.name, before, after: input })],
        );
      } catch (error) {
        asAdminError(error);
      }
    },

    /** Replaces the design file and returns the previous one, so the caller can delete it. */
    async setDesignImage(actor: Admin, id: string, image: DesignImage): Promise<{ imageUrl: string; sourcePath: string }> {
      const current = await getDesign(id);
      await sql.query(
        `WITH updated AS (
           UPDATE designs SET image_url = $2, source_path = $3, image_width = $4, image_height = $5, opaque = $6, updated_at = now()
           WHERE id = $1 RETURNING id
         ) ${logDesign("design.image", 7)} FROM updated`,
        [id, image.imageUrl, image.sourcePath, image.width, image.height, image.opaque, actor.authUserId, actor.email,
          JSON.stringify({ name: current.name, before: current.imageUrl, after: image.imageUrl, width: image.width, height: image.height })],
      );
      return { imageUrl: current.imageUrl, sourcePath: current.sourcePath };
    },

    async setDesignStatus(actor: Admin, id: string, status: DesignStatus): Promise<void> {
      const current = await getDesign(id);
      if (current.status === status) return;
      if (status === "published") {
        if (!current.imageUrl) throw new AdminDataError("conflict", "Subí la imagen del diseño antes de publicarlo.");
        if (!current.kinds.length) throw new AdminDataError("conflict", "Elegí en qué productos está disponible antes de publicarlo.");
      }
      await sql.query(
        `WITH updated AS (UPDATE designs SET status = $2, updated_at = now() WHERE id = $1 RETURNING id)
         ${logDesign("design.status", 3)} FROM updated`,
        [id, status, actor.authUserId, actor.email, JSON.stringify({ name: current.name, before: current.status, after: status })],
      );
    },

    /** Designs that were already sold are archived instead; returns the files to delete. */
    async deleteDesign(actor: Admin, id: string): Promise<{ imageUrl: string; sourcePath: string }> {
      const current = await getDesign(id);
      if (current.orderCount) throw new AdminDataError("conflict", `Tiene ${current.orderCount} pedidos: archivalo en lugar de eliminarlo.`);
      try {
        await sql.query(
          `WITH removed AS (DELETE FROM designs WHERE id = $1 RETURNING id)
           ${logDesign("design.delete", 2)} FROM removed`,
          [id, actor.authUserId, actor.email, JSON.stringify({ name: current.name, slug: current.slug })],
        );
      } catch (error) {
        // An order took the design between the check and the delete.
        if (code(error) === "23503") throw new AdminDataError("conflict", "El diseño tiene pedidos: archivalo en lugar de eliminarlo.");
        throw error;
      }
      return { imageUrl: current.imageUrl, sourcePath: current.sourcePath };
    },

    /** The product each mockup kind sells through; kinds without one are missing. */
    async listMockupBases(): Promise<Partial<Record<MockupKind, MockupBase>>> {
      const rows = (await sql.query(
        `SELECT m.kind, p.id AS product_id, p.legacy_id, p.name, p.status
         FROM mockup_bases m JOIN products p ON p.id = m.product_id`,
      )) as { kind: MockupKind; product_id: string; legacy_id: string; name: string; status: string }[];
      return Object.fromEntries(
        rows.map((row) => [row.kind, { kind: row.kind, productId: row.product_id, legacyId: row.legacy_id, name: row.name, status: row.status }]),
      );
    },

    /**
     * Links a product to a kind, or unlinks the kind with `null`. Takes the
     * catalog id (`legacy_id`) the rest of the admin and the store use.
     */
    async setMockupBase(actor: Admin, kind: MockupKind, catalogId: string | null): Promise<void> {
      if (catalogId !== null && !CATALOG_ID.test(catalogId)) throw new AdminDataError("not_found", "El producto no existe.");
      try {
        if (catalogId === null) {
          await sql.query(
            `WITH removed AS (DELETE FROM mockup_bases WHERE kind = $1 RETURNING kind)
             INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
             SELECT $2, $3, 'design.base', 'design', kind, '{"productId":null}'::jsonb FROM removed`,
            [kind, actor.authUserId, actor.email],
          );
          return;
        }
        const saved = (await sql.query(
          `WITH saved AS (
             INSERT INTO mockup_bases (kind, product_id) SELECT $1, id FROM products WHERE legacy_id = $4
             ON CONFLICT (kind) DO UPDATE SET product_id = excluded.product_id, updated_at = now() RETURNING kind
           ), logged AS (
             INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
             SELECT $2, $3, 'design.base', 'design', kind, jsonb_build_object('productId', $4::text) FROM saved
           )
           SELECT kind FROM saved`,
          [kind, actor.authUserId, actor.email, catalogId],
        )) as { kind: string }[];
        if (!saved.length) throw new AdminDataError("not_found", "El producto no existe.");
      } catch (error) {
        if (code(error) === "23505") {
          throw new AdminDataError("conflict", "Ese producto ya es la base de otro tipo: elegí uno distinto para cada uno.");
        }
        if (code(error) === "23503") throw new AdminDataError("not_found", "El producto no existe.");
        throw error;
      }
    },
  };
}

export type DesignRepository = ReturnType<typeof createDesignRepository>;

/**
 * Published designs with the kinds they can be bought on right now: the kind has
 * a linked product that is active, in a visible category, with active variants.
 * Designs left with no such kind are not shown.
 */
export async function listStorefrontDesigns(sql: QueryFn): Promise<StorefrontDesign[]> {
  const rows = (await sql.query(
    `SELECT d.id, d.slug, d.name, d.description, d.category_id, c.label AS category_label,
            d.image_url, d.image_width, d.image_height, d.opaque,
            json_agg(json_build_object('kind', b.kind, 'productId', p.legacy_id) ORDER BY array_position($1::text[], b.kind)) AS bases
     FROM designs d
     LEFT JOIN categories c ON c.id = d.category_id
     JOIN design_bases b ON b.design_id = d.id
     JOIN mockup_bases m ON m.kind = b.kind
     JOIN products p ON p.id = m.product_id AND p.status = 'active' AND p.legacy_id IS NOT NULL
     JOIN categories pc ON pc.id = p.category_id AND pc.active
     WHERE d.status = 'published' AND (d.category_id IS NULL OR c.active)
       AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active)
     GROUP BY d.id, c.label
     ORDER BY d.sort_order, d.created_at DESC`,
    [KIND_ORDER],
  )) as (Omit<DesignRow, "kinds" | "order_count" | "status" | "source_path" | "updated_at"> & { bases: StorefrontDesign["bases"] })[];
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    categoryId: row.category_id,
    categoryLabel: row.category_label,
    imageUrl: row.image_url,
    width: row.image_width ?? 1,
    height: row.image_height ?? 1,
    opaque: row.opaque,
    bases: row.bases,
  }));
}

export { designLineName } from "../../lib/designs/kinds.ts";
