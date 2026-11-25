import { MOCKUP_KINDS, type DesignStatus, type MockupKind } from "../../lib/designs/kinds.ts";
import { colorKey, garmentColors, variantColor, type GarmentColor } from "../../lib/designs/mockups.ts";
import { AdminDataError, type Admin } from "../admin/repository.ts";
import type { QueryFn } from "../customers/repository.ts";
import { parseThemeLabel, type DesignTheme } from "./themes.ts";
import type { DesignInput } from "./validation.ts";

export type DesignImage = { imageUrl: string; sourcePath: string; width: number; height: number; opaque: boolean };

export type AdminDesign = DesignInput & {
  id: string;
  /** The themes of `themeIds`, in the same order. */
  themes: DesignTheme[];
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

/**
 * Whether a design is offered on a variant: variants without a Color option
 * always are; otherwise its color key must be enabled (`colors` null = every color).
 */
export function colorEnabled(colors: readonly string[] | null | undefined, options: Record<string, string>): boolean {
  const color = variantColor(options);
  return !color || !colors || colors.includes(colorKey(color));
}

/**
 * What the store needs to show a design; `productId` is the storefront id of each
 * base product and `colors` the color keys enabled on it (null = every color).
 */
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
  bases: { kind: MockupKind; productId: string; colors: string[] | null }[];
  /** The design's themes in list order; empty without themes. */
  themes: { slug: string; label: string }[];
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
  colors: Partial<Record<MockupKind, string[]>> | null;
  themes: DesignTheme[] | null;
  order_count: number;
  updated_at: Date;
};

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATALOG_ID = /^[a-z0-9-]{1,40}$/;
const KIND_ORDER = [...MOCKUP_KINDS];

/** Theme list order: by sort_order, then label. Expects the alias t. */
const THEME_ORDER = "t.sort_order, t.label, t.slug";

/** A design's themes as JSON in list order (null without themes). Expects the alias d. */
const themesJson = (fields: string) => `(SELECT json_agg(json_build_object(${fields}) ORDER BY ${THEME_ORDER})
    FROM design_theme_links l JOIN design_themes t ON t.id = l.theme_id WHERE l.design_id = d.id)`;

const SELECT_DESIGNS = `
  SELECT d.id, d.slug, d.name, d.description, d.category_id, c.label AS category_label, d.status,
         d.image_url, d.source_path, d.image_width, d.image_height, d.opaque, d.updated_at,
         (SELECT array_agg(b.kind ORDER BY array_position($1::text[], b.kind)) FROM design_bases b WHERE b.design_id = d.id) AS kinds,
         (SELECT json_object_agg(kind, colors) FROM (
            SELECT dc.kind, array_agg(dc.color ORDER BY dc.color) AS colors FROM design_colors dc WHERE dc.design_id = d.id GROUP BY dc.kind
          ) per_kind) AS colors,
         ${themesJson("'id', t.id, 'slug', t.slug, 'label', t.label")} AS themes,
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
  colors: row.colors ?? {},
  themeIds: (row.themes ?? []).map((theme) => theme.id),
  themes: row.themes ?? [],
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
  if (code(error) === "23503" && constraint(error).includes("theme")) throw new AdminDataError("not_found", THEME_NOT_FOUND);
  throw error;
}

const THEME_NOT_FOUND = "La temática no existe.";

/** The theme ids of an input; callers from before themes send none. A malformed id is an unknown theme. */
function themeIdsOf(input: DesignInput): string[] {
  const ids = input.themeIds ?? [];
  if (ids.some((id) => !ID.test(id))) throw new AdminDataError("not_found", THEME_NOT_FOUND);
  return ids;
}

/** The (kind, color) pairs of a design input, as two parallel arrays for unnest(). */
function colorPairs(input: DesignInput): [MockupKind[], string[]] {
  const pairs = input.kinds.flatMap((kind) => (input.colors?.[kind] ?? []).map((color) => [kind, color] as const));
  return [pairs.map(([kind]) => kind), pairs.map(([, color]) => color)];
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
 * kind sells through the product linked to it in `mockup_bases`, on the garment
 * colors saved in `design_colors` (none saved = every color). Every change writes
 * its audit entry in the same statement.
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
      const themeIds = themeIdsOf(input);
      try {
        const [row] = (await sql.query(
          `WITH created AS (
             INSERT INTO designs (slug, name, description, category_id) VALUES ($1, $2, $3, $4) RETURNING id
           ), bases AS (
             INSERT INTO design_bases (design_id, kind) SELECT id, kind FROM created, unnest($5::text[]) AS kind
           ), colors AS (
             INSERT INTO design_colors (design_id, kind, color)
             SELECT id, pair.kind, pair.color FROM created, unnest($6::text[], $7::text[]) AS pair (kind, color)
           ), themes AS (
             INSERT INTO design_theme_links (design_id, theme_id) SELECT id, theme FROM created, unnest($11::uuid[]) AS theme
           ), logged AS (${logDesign("design.create", 8)} FROM created)
           SELECT id FROM created`,
          [input.slug, input.name, input.description, input.categoryId, input.kinds, ...colorPairs(input), actor.authUserId, actor.email, JSON.stringify(input),
            themeIds],
        )) as { id: string }[];
        return row.id;
      } catch (error) {
        asAdminError(error);
      }
    },

    /** Saves the data, base products and colors. A published design must keep at least one base product. */
    async updateDesign(actor: Admin, id: string, input: DesignInput): Promise<void> {
      const themeIds = themeIdsOf(input);
      const current = await getDesign(id);
      if (current.status === "published" && !input.kinds.length) {
        throw new AdminDataError("conflict", "Un diseño publicado tiene que estar disponible en al menos un producto.");
      }
      const before = { name: current.name, slug: current.slug, description: current.description, categoryId: current.categoryId, kinds: current.kinds, colors: current.colors, themeIds: current.themeIds };
      try {
        await sql.query(
          `WITH updated AS (
             UPDATE designs SET slug = $2, name = $3, description = $4, category_id = $5, updated_at = now() WHERE id = $1 RETURNING id
           ), cleared AS (
             DELETE FROM design_bases WHERE design_id IN (SELECT id FROM updated) AND NOT (kind = ANY ($6::text[]))
           ), added AS (
             INSERT INTO design_bases (design_id, kind) SELECT id, kind FROM updated, unnest($6::text[]) AS kind ON CONFLICT DO NOTHING
           ), colors_cleared AS (
             DELETE FROM design_colors WHERE design_id IN (SELECT id FROM updated)
               AND (kind, color) NOT IN (SELECT * FROM unnest($7::text[], $8::text[]))
           ), colors_added AS (
             INSERT INTO design_colors (design_id, kind, color)
             SELECT id, pair.kind, pair.color FROM updated, unnest($7::text[], $8::text[]) AS pair (kind, color) ON CONFLICT DO NOTHING
           ), themes_cleared AS (
             DELETE FROM design_theme_links WHERE design_id IN (SELECT id FROM updated) AND NOT (theme_id = ANY ($12::uuid[]))
           ), themes_added AS (
             INSERT INTO design_theme_links (design_id, theme_id) SELECT id, theme FROM updated, unnest($12::uuid[]) AS theme ON CONFLICT DO NOTHING
           ), logged AS (${logDesign("design.update", 9)} FROM updated)
           SELECT id FROM updated`,
          [id, input.slug, input.name, input.description, input.categoryId, input.kinds, ...colorPairs(input), actor.authUserId, actor.email,
            JSON.stringify({ name: input.name, before, after: input }), themeIds],
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

    /** Every design theme, in list order. */
    async listThemes(): Promise<DesignTheme[]> {
      return (await sql.query(`SELECT t.id, t.slug, t.label FROM design_themes t ORDER BY ${THEME_ORDER}`)) as DesignTheme[];
    },

    /**
     * Creates a theme from a label and returns it. A label whose slug already
     * exists (it only differs in case, accents or punctuation) returns that theme
     * instead of a duplicate, and logs nothing.
     */
    async createTheme(actor: Admin, label: string): Promise<DesignTheme> {
      const parsed = parseThemeLabel(label);
      if (!parsed.ok) throw new AdminDataError("conflict", parsed.error);
      const [row] = (await sql.query(
        `WITH created AS (
           INSERT INTO design_themes (slug, label) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING RETURNING id, slug, label
         ), logged AS (
           INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
           SELECT $3, $4, 'design.theme_create', 'design', id::text, jsonb_build_object('label', label, 'slug', slug) FROM created
         )
         SELECT id, slug, label FROM created`,
        [parsed.slug, parsed.label, actor.authUserId, actor.email],
      )) as DesignTheme[];
      if (row) return row;
      // Already there, maybe created a moment ago by another admin.
      const [existing] = (await sql.query(`SELECT id, slug, label FROM design_themes WHERE slug = $1`, [parsed.slug])) as DesignTheme[];
      return existing;
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
     * The garment colors of each kind's base product: the Color option of its
     * active variants, in variant order. Kinds without a base or without colors are missing.
     */
    async listKindColors(): Promise<Partial<Record<MockupKind, GarmentColor[]>>> {
      const rows = (await sql.query(
        `SELECT m.kind, v.options
         FROM mockup_bases m JOIN product_variants v ON v.product_id = m.product_id AND v.active
         ORDER BY m.kind, v.sort_order, v.created_at`,
      )) as { kind: MockupKind; options: Record<string, string> }[];
      const byKind = new Map<MockupKind, { options: Record<string, string> }[]>();
      for (const row of rows) byKind.set(row.kind, [...(byKind.get(row.kind) ?? []), row]);
      return Object.fromEntries([...byKind].map(([kind, variants]) => [kind, garmentColors(variants)]).filter(([, colors]) => colors.length));
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

/** A base as BASES_JSON returns it. */
export type OfferedBaseRow = { kind: MockupKind; productId: string; colors: string[] | null; variants: Record<string, string>[] | null };

/** Bases that still have an active variant in an enabled color (or without a Color option). */
export const offerableBases = <T extends OfferedBaseRow>(bases: readonly T[]): T[] =>
  bases.filter((base) => (base.variants ?? []).some((options) => colorEnabled(base.colors, options)));

/**
 * The bases of a design as JSON, one object per kind in kind order: `colors` the
 * enabled color keys (null = every color) and `variants` the options of the base
 * product's active variants. Expects the aliases d, b and p, and the kind order in $1.
 */
export const BASES_JSON = `json_agg(json_build_object(
    'kind', b.kind, 'productId', p.legacy_id,
    'colors', (SELECT json_agg(dc.color ORDER BY dc.color) FROM design_colors dc WHERE dc.design_id = d.id AND dc.kind = b.kind),
    'variants', (SELECT json_agg(v.options) FROM product_variants v WHERE v.product_id = p.id AND v.active)
  ) ORDER BY array_position($1::text[], b.kind))`;

/**
 * Published designs with the kinds they can be bought on right now: the kind has
 * a linked product that is active, in a visible category, with an active variant
 * in a color enabled for the design. Designs left with no such kind are not shown.
 */
export async function listStorefrontDesigns(sql: QueryFn): Promise<StorefrontDesign[]> {
  const rows = (await sql.query(
    `SELECT d.id, d.slug, d.name, d.description, d.category_id, c.label AS category_label,
            d.image_url, d.image_width, d.image_height, d.opaque,
            ${BASES_JSON} AS bases,
            ${themesJson("'slug', t.slug, 'label', t.label")} AS themes
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
  )) as (Omit<DesignRow, "kinds" | "colors" | "themes" | "order_count" | "status" | "source_path" | "updated_at"> & {
    bases: OfferedBaseRow[];
    themes: { slug: string; label: string }[] | null;
  })[];
  return rows.flatMap((row) => {
    const bases = offerableBases(row.bases).map(({ kind, productId, colors }) => ({ kind, productId, colors }));
    return bases.length ? [{ row, bases }] : [];
  }).map(({ row, bases }) => ({
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
    bases,
    themes: row.themes ?? [],
  }));
}

export { designLineName } from "../../lib/designs/kinds.ts";
