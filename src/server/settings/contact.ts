import type { QueryFn } from "../db/client.ts";

/** Store contact channels edited from /admin/ajustes (store_settings key 'contact'). Empty = not shown. */
export type ContactSettings = {
  /** International digits only, e.g. 5492615551234 (54 9 + area + number). Empty = no WhatsApp link. */
  whatsapp: string;
  email: string;
  phone: string;
  address: string;
  hours: string;
  /** Full profile URLs, normalized from a handle or a link. */
  instagram: string;
  facebook: string;
  tiktok: string;
};

export const DEFAULT_CONTACT: ContactSettings = {
  whatsapp: "",
  email: "",
  phone: "",
  address: "",
  hours: "",
  instagram: "",
  facebook: "",
  tiktok: "",
};

type Social = "instagram" | "facebook" | "tiktok";

const SOCIAL: Record<Social, { label: string; host: string; handle: RegExp; url: (handle: string) => string }> = {
  instagram: { label: "Instagram", host: "instagram.com", handle: /^[A-Za-z0-9._]{1,30}$/, url: (h) => `https://www.instagram.com/${h}` },
  facebook: { label: "Facebook", host: "facebook.com", handle: /^[A-Za-z0-9.-]{2,80}$/, url: (h) => `https://www.facebook.com/${h}` },
  tiktok: { label: "TikTok", host: "tiktok.com", handle: /^[A-Za-z0-9._]{2,24}$/, url: (h) => `https://www.tiktok.com/@${h}` },
};

/** "@user", "user", "instagram.com/user" or the full link → the profile URL; null when it is not one. */
function parseSocial(network: Social, raw: string): string | null {
  const { host, handle, url } = SOCIAL[network];
  let candidate = raw.replace(/^@/, "");
  const link = raw.match(/^(?:https?:\/\/)?(?:www\.|m\.)?([a-z.]+)\/@?([^/?#]+)\/?(?:[?#].*)?$/i);
  if (link) {
    if (link[1].toLowerCase() !== host) return null;
    candidate = link[2];
    // profile.php?id=… loses its id here: ask for the page name instead.
    if (candidate.toLowerCase() === "profile.php") return null;
  }
  return handle.test(candidate) ? url(candidate) : null;
}

const text = (data: Record<string, unknown>, key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");

/**
 * Accepts what people type. WhatsApp keeps the digits wa.me expects ("+54 9 261 555-1234";
 * "0261 15 555 1234" is not enough: it needs the country code).
 */
export function parseContact(data: Record<string, unknown>): { ok: true; value: ContactSettings } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const raw = text(data, "whatsapp");
  const digits = raw.replace(/[\s()+-]/g, "");
  if (raw && (!/^\d+$/.test(digits) || digits.length < 11 || digits.length > 15 || !digits.startsWith("54"))) {
    errors.whatsapp = "Escribilo con código de país y de área, ej.: +54 9 261 555 1234.";
  }
  const email = text(data, "email").toLowerCase();
  if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) errors.email = "Revisá el email, ej.: hola@sublime.com.ar.";
  const phone = text(data, "phone");
  if (phone && (phone.length > 40 || !/^[\d\s()+-]+$/.test(phone) || phone.replace(/\D/g, "").length < 8)) {
    errors.phone = "Escribí el teléfono con código de área, ej.: 261 555-1234.";
  }
  const address = text(data, "address");
  if (address.length > 160) errors.address = "Usá hasta 160 caracteres.";
  const hours = text(data, "hours");
  if (hours.length > 120) errors.hours = "Usá hasta 120 caracteres.";
  const social = {} as Record<Social, string>;
  for (const network of Object.keys(SOCIAL) as Social[]) {
    const value = text(data, network);
    const parsed = value ? parseSocial(network, value) : "";
    if (parsed === null) errors[network] = `Escribí el usuario (ej.: @sublime) o el link de tu perfil de ${SOCIAL[network].label}.`;
    social[network] = parsed ?? "";
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { whatsapp: digits, email, phone, address, hours, ...social } };
}

export type ContactItem = { label: string; value: string; href?: string };

/** What the footer shows: only the data that is set, in a fixed order. */
export function contactItems(settings: ContactSettings): ContactItem[] {
  const items: ContactItem[] = [];
  if (settings.whatsapp) items.push({ label: "WhatsApp", value: `+${settings.whatsapp}`, href: `https://wa.me/${settings.whatsapp}` });
  if (settings.email) items.push({ label: "Email", value: settings.email, href: `mailto:${settings.email}` });
  if (settings.phone) items.push({ label: "Teléfono", value: settings.phone, href: `tel:${settings.phone.replace(/[^\d+]/g, "")}` });
  if (settings.address) items.push({ label: "Dirección", value: settings.address });
  if (settings.hours) items.push({ label: "Horario", value: settings.hours });
  for (const network of Object.keys(SOCIAL) as Social[]) {
    const url = settings[network];
    if (url) items.push({ label: SOCIAL[network].label, value: `@${url.split("/").pop()!.replace(/^@/, "")}`, href: url });
  }
  return items;
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
