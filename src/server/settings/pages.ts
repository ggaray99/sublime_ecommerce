import type { QueryFn } from "../db/client.ts";
import type { InfoPageContent, InfoSection } from "../../data/site.ts";

/** Informational pages whose text is edited from /admin/ajustes (store_settings key 'page_<slug>'). */
export const INFO_PAGE_SLUGS = ["nosotros", "envios", "preguntas", "politicas"] as const;
export type InfoPageSlug = (typeof INFO_PAGE_SLUGS)[number];

export const isInfoPageSlug = (slug: string): slug is InfoPageSlug => (INFO_PAGE_SLUGS as readonly string[]).includes(slug);

export type PageText = { intro: string; sections: { title: string; body: string }[] };

/** Rows the editor offers: the saved sections plus a few empty ones, up to this many. */
export const MAX_SECTIONS = 12;

export function parsePageContent(data: Record<string, unknown>): { ok: true; value: PageText } | { ok: false; errors: Record<string, string> } {
  const read = (key: string) => (typeof data[key] === "string" ? (data[key] as string).replace(/\r\n/g, "\n").trim() : "");
  const errors: Record<string, string> = {};
  const intro = read("intro");
  if (!intro) errors.intro = "Escribí una introducción.";
  else if (intro.length > 400) errors.intro = "Usá hasta 400 caracteres.";

  const sections: PageText["sections"] = [];
  for (let row = 1; row <= MAX_SECTIONS; row++) {
    const title = read(`title${row}`);
    const body = read(`body${row}`);
    if (!title && !body) continue;
    if (!title) errors[`title${row}`] = "Ponele un título a esta sección o borrá el texto.";
    else if (title.length > 80) errors[`title${row}`] = "Usá hasta 80 caracteres.";
    if (!body) errors[`body${row}`] = "Escribí el texto de esta sección o borrá el título.";
    else if (body.length > 4000) errors[`body${row}`] = "Usá hasta 4000 caracteres.";
    sections.push({ title, body });
  }
  if (!sections.length) errors.title1 = "Agregá al menos una sección.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { intro, sections } };
}

/** The saved text replaces the default one; title and description (SEO) stay as in the code. */
export function mergeInfoPage(base: InfoPageContent, saved: PageText | null): InfoPageContent {
  if (!saved) return base;
  const sections: InfoSection[] = saved.sections.map(({ title, body }) => ({ title, body }));
  return { ...base, intro: saved.intro, sections };
}

const audit = "INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)";

export function createPagesRepository(sql: QueryFn) {
  return {
    async get(slug: InfoPageSlug): Promise<PageText | null> {
      const [row] = (await sql.query("SELECT value FROM store_settings WHERE key = $1", [`page_${slug}`])) as { value: PageText }[];
      return row?.value ?? null;
    },

    async save(actor: { authUserId: string; email: string }, slug: string, page: PageText): Promise<void> {
      if (!isInfoPageSlug(slug)) throw new Error(`Página desconocida: ${slug}`);
      await sql.query(
        `WITH saved AS (
           INSERT INTO store_settings (key, value, updated_by) VALUES ($4, $1::jsonb, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
           RETURNING key
         )
         ${audit} SELECT $3, $2, 'settings.page', 'settings', key, $1::jsonb FROM saved`,
        [JSON.stringify(page), actor.email, actor.authUserId, `page_${slug}`],
      );
    },
  };
}
