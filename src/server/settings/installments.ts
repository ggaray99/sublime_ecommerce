import type { QueryFn } from "../db/client.ts";
import { parsePesos } from "../admin/validation.ts";

/** Interest-free installments the store advertises (paid through Mercado Pago). Off until the owner turns them on. */
export type InstallmentsSettings = { enabled: boolean; count: number; minAmount: number };

export const DEFAULT_INSTALLMENTS: InstallmentsSettings = { enabled: false, count: 3, minAmount: 0 };

export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 24;

export function parseInstallments(
  data: Record<string, unknown>,
): { ok: true; value: InstallmentsSettings } | { ok: false; errors: Record<string, string> } {
  const text = (key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");
  const errors: Record<string, string> = {};
  const enabled = data.enabled === true || data.enabled === "on" || data.enabled === "true";

  const rawCount = text("count");
  const count = Number(rawCount);
  if (!/^\d+$/.test(rawCount) || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS) {
    errors.count = `Una cantidad de cuotas de ${MIN_INSTALLMENTS} a ${MAX_INSTALLMENTS}.`;
  }

  const rawMin = text("minAmount");
  const minMinor = rawMin ? parsePesos(rawMin) : 0;
  if (minMinor === null || minMinor % 100 !== 0) errors.minAmount = "Un monto en pesos sin centavos, por ejemplo 20.000 (vacío = desde $ 0).";

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { enabled, count, minAmount: (minMinor ?? 0) / 100 } };
}

export function createInstallmentsRepository(sql: QueryFn) {
  return {
    async get(): Promise<InstallmentsSettings> {
      const [row] = (await sql.query("SELECT value FROM store_settings WHERE key = 'installments'")) as { value: Partial<InstallmentsSettings> }[];
      return { ...DEFAULT_INSTALLMENTS, ...(row?.value ?? {}) };
    },

    async save(actor: { authUserId: string; email: string }, settings: InstallmentsSettings): Promise<void> {
      await sql.query(
        `WITH saved AS (
           INSERT INTO store_settings (key, value, updated_by) VALUES ('installments', $1::jsonb, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
           RETURNING key
         )
         INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
         SELECT $3, $2, 'settings.installments', 'settings', key, $1::jsonb FROM saved`,
        [JSON.stringify(settings), actor.email, actor.authUserId],
      );
    },
  };
}
