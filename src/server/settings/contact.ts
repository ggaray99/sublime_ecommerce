import type { QueryFn } from "../db/client.ts";

/** Store contact channels edited from /admin/ajustes (store_settings key 'contact'). */
export type ContactSettings = {
  /** International digits only, e.g. 5492615551234 (54 9 + area + number). Empty = no WhatsApp link. */
  whatsapp: string;
};

export const DEFAULT_CONTACT: ContactSettings = { whatsapp: "" };

/**
 * Accepts what people type ("+54 9 261 555-1234", "0261 15 555 1234" is not enough:
 * it needs the country code) and keeps the digits wa.me expects.
 */
export function parseContact(data: Record<string, unknown>): { ok: true; value: ContactSettings } | { ok: false; errors: Record<string, string> } {
  const raw = typeof data.whatsapp === "string" ? data.whatsapp.trim() : "";
  const digits = raw.replace(/[\s()+-]/g, "");
  if (raw && (!/^\d+$/.test(digits) || digits.length < 11 || digits.length > 15 || !digits.startsWith("54"))) {
    return { ok: false, errors: { whatsapp: "Escribilo con código de país y de área, ej.: +54 9 261 555 1234." } };
  }
  return { ok: true, value: { whatsapp: digits } };
}

/** wa.me link with a prefilled message, or null when no number is set. */
export function whatsappLink(settings: ContactSettings, message: string): string | null {
  return settings.whatsapp ? `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(message)}` : null;
}

const audit = "INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)";

export function createContactRepository(sql: QueryFn) {
  return {
    async get(): Promise<ContactSettings> {
      const [row] = (await sql.query("SELECT value FROM store_settings WHERE key = 'contact'")) as { value: Partial<ContactSettings> }[];
      return { ...DEFAULT_CONTACT, ...(row?.value ?? {}) };
    },

    async save(actor: { authUserId: string; email: string }, settings: ContactSettings): Promise<void> {
      await sql.query(
        `WITH saved AS (
           INSERT INTO store_settings (key, value, updated_by) VALUES ('contact', $1::jsonb, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
           RETURNING key
         )
         ${audit} SELECT $3, $2, 'settings.contact', 'settings', key, $1::jsonb FROM saved`,
        [JSON.stringify(settings), actor.email, actor.authUserId],
      );
    },
  };
}
