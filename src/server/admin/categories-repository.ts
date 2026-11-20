import type { QueryFn } from "../customers/repository.ts";
import { AdminDataError, type Admin } from "./repository.ts";
import type { CategoryCreateInput, CategoryInput } from "./validation.ts";

export type AdminCategory = CategoryInput & { id: string; imageUrl: string; productCount: number; activeProductCount: number };

type CategoryRow = {
  id: string;
  label: string;
  tagline: string;
  description: string;
  sort_order: number;
  active: boolean;
  image_url: string;
  product_count: number;
  active_product_count: number;
};

const toCategory = (row: CategoryRow): AdminCategory => ({
  id: row.id,
  label: row.label,
  tagline: row.tagline,
  description: row.description,
  sortOrder: row.sort_order,
  active: row.active,
  imageUrl: row.image_url,
  productCount: Number(row.product_count),
  activeProductCount: Number(row.active_product_count),
});

const SELECT_CATEGORIES = `
  SELECT c.id, c.label, c.tagline, c.description, c.sort_order, c.active, c.image_url,
         count(p.id)::int AS product_count,
         count(p.id) FILTER (WHERE p.status = 'active')::int AS active_product_count
  FROM categories c
  LEFT JOIN products p ON p.category_id = c.id`;

const CATEGORY_ID = /^[a-z0-9-]{1,40}$/;

function assertCategoryId(id: string) {
  if (!CATEGORY_ID.test(id)) throw new AdminDataError("not_found", "La categoría no existe.");
}

const FIELDS = ["label", "tagline", "description", "sortOrder", "active"] as const satisfies readonly (keyof CategoryInput)[];

/**
 * Category administration. Categories are referenced by products, so they are
 * hidden (active = false) rather than deleted; only empty ones can be deleted.
 */
export function createCategoryRepository(sql: QueryFn) {
  async function getCategory(id: string): Promise<AdminCategory> {
    assertCategoryId(id);
    const [row] = (await sql.query(`${SELECT_CATEGORIES} WHERE c.id = $1 GROUP BY c.id`, [id])) as CategoryRow[];
    if (!row) throw new AdminDataError("not_found", "La categoría no existe.");
    return toCategory(row);
  }

  return {
    async listCategories(): Promise<AdminCategory[]> {
      const rows = (await sql.query(`${SELECT_CATEGORIES} GROUP BY c.id ORDER BY c.sort_order, c.label`)) as CategoryRow[];
      return rows.map(toCategory);
    },

    getCategory,

    async createCategory(actor: Admin, input: CategoryCreateInput): Promise<AdminCategory> {
      try {
        await sql.query(
          `WITH category AS (
             INSERT INTO categories (id, label, tagline, description, sort_order, active)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
           )
           INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
           SELECT $7, $8, 'category.create', 'category', id, $9::jsonb FROM category`,
          [input.id, input.label, input.tagline, input.description, input.sortOrder, input.active, actor.authUserId, actor.email, JSON.stringify(input)],
        );
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new AdminDataError("conflict", "Ya existe una categoría con ese identificador.");
        throw error;
      }
      return getCategory(input.id);
    },

    /** Writes an audit entry with only the fields that changed; no-op saves write nothing. */
    async updateCategory(actor: Admin, id: string, input: CategoryInput): Promise<AdminCategory> {
      const current = await getCategory(id);
      const changes: Record<string, { before: unknown; after: unknown }> = {};
      for (const key of FIELDS) if (current[key] !== input[key]) changes[key] = { before: current[key], after: input[key] };
      if (!Object.keys(changes).length) return current;
      await sql.query(
        `WITH updated AS (
           UPDATE categories SET label = $2, tagline = $3, description = $4, sort_order = $5, active = $6, updated_at = now()
           WHERE id = $1 RETURNING id
         )
         INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
         SELECT $7, $8, 'category.update', 'category', id, $9::jsonb FROM updated`,
        [id, input.label, input.tagline, input.description, input.sortOrder, input.active, actor.authUserId, actor.email, JSON.stringify(changes)],
      );
      return getCategory(id);
    },

    /** Sets the cover image; returns the previous URL so the caller can delete the old file. */
    async setCategoryImage(actor: Admin, id: string, imageUrl: string): Promise<string> {
      const current = await getCategory(id);
      await sql.query(
        `WITH updated AS (UPDATE categories SET image_url = $2, updated_at = now() WHERE id = $1 RETURNING id)
         INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
         SELECT $3, $4, 'category.image', 'category', id, jsonb_build_object('before', $5::text, 'after', $2::text) FROM updated`,
        [id, imageUrl, actor.authUserId, actor.email, current.imageUrl],
      );
      return current.imageUrl;
    },

    /** Only categories without products (in any status) can be deleted. */
    async deleteCategory(actor: Admin, id: string): Promise<string> {
      const current = await getCategory(id);
      if (current.productCount) {
        throw new AdminDataError("conflict", `Tiene ${current.productCount} productos: ocultala o mové los productos antes de eliminarla.`);
      }
      const [{ designs }] = (await sql.query(`SELECT count(*)::int AS designs FROM designs WHERE category_id = $1`, [id])) as { designs: number }[];
      if (designs) {
        throw new AdminDataError("conflict", `Tiene ${designs} diseños: ocultala o mové los diseños antes de eliminarla.`);
      }
      try {
        await sql.query(
          `WITH removed AS (
             DELETE FROM categories WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM products WHERE category_id = $1) RETURNING id
           )
           INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
           SELECT $2, $3, 'category.delete', 'category', id, $4::jsonb FROM removed`,
          [id, actor.authUserId, actor.email, JSON.stringify({ label: current.label })],
        );
      } catch (error) {
        // A product or design was assigned between the check and the delete.
        if ((error as { code?: string }).code === "23503") throw new AdminDataError("conflict", "La categoría tiene productos o diseños.");
        throw error;
      }
      return current.imageUrl;
    },
  };
}

export type CategoryRepository = ReturnType<typeof createCategoryRepository>;
