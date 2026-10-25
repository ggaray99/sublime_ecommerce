import type { QueryFn } from "../db/client.ts";
import { DEFAULT_LAB_PRICING, type LabPricing } from "../../lib/lab/pricing.ts";
import { parsePesos } from "../admin/validation.ts";

/** Rows of tiers in the settings form. */
export const TIER_ROWS = 3;

export function parseLabPricing(data: Record<string, unknown>): { ok: true; value: LabPricing } | { ok: false; errors: Record<string, string> } {
  const text = (key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");
  const errors: Record<string, string> = {};
  const raw = text("sheetPrice");
  const sheetPriceMinor = raw ? parsePesos(raw) : 0;
  if (sheetPriceMinor === null) errors.sheetPrice = "Un precio en pesos, por ejemplo 10.001,10 (vacío = sin estimación).";
  const tiers: LabPricing["tiers"] = [];
  for (let row = 1; row <= TIER_ROWS; row++) {
    const min = text(`tierMin${row}`);
    const pct = text(`tierPercent${row}`);
    if (!min && !pct) continue;
    const minSheets = Number(min);
    const percent = Number(pct);
    if (!Number.isInteger(minSheets) || minSheets < 2 || minSheets > 1000 || !Number.isInteger(percent) || percent < 1 || percent > 80) {
      errors[`tierMin${row}`] = "Desde 2 planchas y un descuento de 1 a 80 %.";
    } else tiers.push({ minSheets, percent });
  }
  if (new Set(tiers.map((tier) => tier.minSheets)).size !== tiers.length) errors.tierMin1 = "Cada escala con una cantidad distinta.";
  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value: { sheetPriceMinor: sheetPriceMinor ?? 0, tiers: tiers.sort((a, b) => a.minSheets - b.minSheets) } };
}

export function createLabPricingRepository(sql: QueryFn) {
  return {
    async get(): Promise<LabPricing> {
      const [row] = (await sql.query("SELECT value FROM store_settings WHERE key = 'lab_pricing'")) as { value: Partial<LabPricing> }[];
      return { ...DEFAULT_LAB_PRICING, ...(row?.value ?? {}) };
    },

    async save(actor: { authUserId: string; email: string }, pricing: LabPricing): Promise<void> {
      await sql.query(
        `WITH saved AS (
           INSERT INTO store_settings (key, value, updated_by) VALUES ('lab_pricing', $1::jsonb, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
           RETURNING key
         )
         INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
         SELECT $3, $2, 'settings.lab_pricing', 'settings', key, $1::jsonb FROM saved`,
        [JSON.stringify(pricing), actor.email, actor.authUserId],
      );
    },
  };
}
