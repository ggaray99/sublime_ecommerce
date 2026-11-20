import { slotKey, type Box, type TemplateOverrides, type TemplateSlot } from "../../lib/designs/mockups.ts";
import { AdminDataError, type Admin } from "../admin/repository.ts";
import type { QueryFn } from "../customers/repository.ts";

/** An uploaded template as stored: the photo, its print area and, except stickers, its warp maps. */
export type StoredTemplate = TemplateSlot & {
  imageUrl: string;
  area: Box;
  warp: { map: string; shade: string; scale: number } | null;
  /** Mug only. */
  curve: number | null;
  updatedAt: Date;
};

export type TemplateInput = Omit<StoredTemplate, keyof TemplateSlot | "updatedAt">;

type Row = {
  kind: TemplateSlot["kind"];
  tone: TemplateSlot["tone"];
  side: TemplateSlot["side"];
  image_url: string;
  area_left: number;
  area_top: number;
  area_width: number;
  area_height: number;
  map_url: string | null;
  shade_url: string | null;
  warp_scale: number | null;
  curve: number | null;
  updated_at: Date;
};

const COLUMNS = `kind, tone, side, image_url, area_left, area_top, area_width, area_height, map_url, shade_url, warp_scale, curve, updated_at`;

function fromRow(row: Row): StoredTemplate {
  return {
    kind: row.kind,
    tone: row.tone,
    side: row.side,
    imageUrl: row.image_url,
    area: { left: row.area_left, top: row.area_top, width: row.area_width, height: row.area_height },
    warp: row.map_url && row.shade_url && row.warp_scale ? { map: row.map_url, shade: row.shade_url, scale: Number(row.warp_scale) } : null,
    curve: row.curve === null ? null : Number(row.curve),
    updatedAt: row.updated_at,
  };
}

/** Every file a stored template points at, to delete once nothing uses them. */
export const templateFiles = (template: Pick<StoredTemplate, "imageUrl" | "warp">): string[] =>
  [template.imageUrl, template.warp?.map, template.warp?.shade].filter((url): url is string => Boolean(url));

const logTemplate = (action: string, first: number) =>
  `INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
   SELECT $${first}, $${first + 1}, '${action}', 'design', kind || '-' || tone || '-' || side, $${first + 2}::jsonb`;

/** Uploaded mockup templates (Admin › Soportes); the slot is checked by the caller. */
export function createMockupTemplateRepository(sql: QueryFn) {
  async function getTemplate(slot: TemplateSlot): Promise<StoredTemplate | null> {
    const rows = (await sql.query(`SELECT ${COLUMNS} FROM mockup_templates WHERE kind = $1 AND tone = $2 AND side = $3`, [
      slot.kind,
      slot.tone,
      slot.side,
    ])) as Row[];
    return rows[0] ? fromRow(rows[0]) : null;
  }

  return {
    getTemplate,

    async listTemplates(): Promise<StoredTemplate[]> {
      return ((await sql.query(`SELECT ${COLUMNS} FROM mockup_templates ORDER BY kind, tone, side`)) as Row[]).map(fromRow);
    },

    /** Creates or replaces the slot's template; returns the previous one, whose files the caller deletes. */
    async saveTemplate(actor: Admin, slot: TemplateSlot, input: TemplateInput): Promise<StoredTemplate | null> {
      const previous = await getTemplate(slot);
      const { area, warp } = input;
      const changes = JSON.stringify({ imageUrl: input.imageUrl, area, curve: input.curve });
      await sql.query(
        `WITH saved AS (
           INSERT INTO mockup_templates (kind, tone, side, image_url, area_left, area_top, area_width, area_height, map_url, shade_url, warp_scale, curve)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (kind, tone, side) DO UPDATE SET
             image_url = excluded.image_url, area_left = excluded.area_left, area_top = excluded.area_top,
             area_width = excluded.area_width, area_height = excluded.area_height, map_url = excluded.map_url,
             shade_url = excluded.shade_url, warp_scale = excluded.warp_scale, curve = excluded.curve, updated_at = now()
           RETURNING kind, tone, side
         )
         ${logTemplate("design.template", 13)} FROM saved`,
        [
          slot.kind,
          slot.tone,
          slot.side,
          input.imageUrl,
          area.left,
          area.top,
          area.width,
          area.height,
          warp?.map ?? null,
          warp?.shade ?? null,
          warp?.scale ?? null,
          input.curve,
          actor.authUserId,
          actor.email,
          changes,
        ],
      );
      return previous;
    },

    /** Back to the built-in template; returns the removed one, whose files the caller deletes. */
    async deleteTemplate(actor: Admin, slot: TemplateSlot): Promise<StoredTemplate> {
      const current = await getTemplate(slot);
      if (!current) throw new AdminDataError("not_found", "Ese soporte ya usa la imagen original.");
      await sql.query(
        `WITH removed AS (DELETE FROM mockup_templates WHERE kind = $1 AND tone = $2 AND side = $3 RETURNING kind, tone, side)
         ${logTemplate("design.template_reset", 4)} FROM removed`,
        [slot.kind, slot.tone, slot.side, actor.authUserId, actor.email, JSON.stringify({ imageUrl: current.imageUrl })],
      );
      return current;
    },
  };
}

export type MockupTemplateRepository = ReturnType<typeof createMockupTemplateRepository>;

/** What the store passes to every mockup: the uploaded templates by slot. */
export async function listTemplateOverrides(sql: QueryFn): Promise<TemplateOverrides> {
  const templates = await createMockupTemplateRepository(sql).listTemplates();
  return Object.fromEntries(
    templates.map((template) => [slotKey(template), { src: template.imageUrl, area: template.area, ...(template.warp ? { warp: template.warp } : {}) }]),
  );
}
