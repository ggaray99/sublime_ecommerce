import type { QueryFn } from "../db/client.ts";

/** The home hero ("PEGÁ TU IDENTIDAD."), edited from /admin/portada. */
export type HomeHero = {
  kicker: string;
  titleLine1: string;
  /** Second line, highlighted in cyan. */
  titleLine2: string;
  lede: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  /** Round sticker over the collage; empty hides it. */
  stamp: string;
  /** Up to three product ids for the collage, in order (1 = the big one). */
  productIds: string[];
};

/** What the home showed before it was editable; also the fallback for anything missing. */
export const DEFAULT_HERO: HomeHero = {
  kicker: "Stickers / DTF / Vinilos / Remeras",
  titleLine1: "PEGÁ",
  titleLine2: "TU IDENTIDAD.",
  lede: "Calcos troquelados, packs, remeras y productos a medida con diseños originales.",
  primaryLabel: "Explorar calcos",
  primaryHref: "/tienda?categoria=stickers",
  secondaryLabel: "Ver personalizados →",
  secondaryHref: "/encargos",
  stamp: "DISEÑOS ORIGINALES",
  productIds: [],
};

/** Collage used while no products are chosen, or to fill the slots of hidden ones. */
export const DEFAULT_HERO_SLUGS = ["pack-caos-grafico", "remera-ruido-visual", "sticker-gato-de-la-suerte-137"];

type Data = Record<string, unknown>;
const text = (data: Data, key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");

/** Buttons only point inside the store: a path like /tienda?categoria=stickers, never another site. */
const INTERNAL_LINK = /^\/(?!\/)[\w\-./?=&#%]*$/;

const LIMITS = {
  kicker: 60,
  titleLine1: 18,
  titleLine2: 18,
  lede: 240,
  primaryLabel: 30,
  secondaryLabel: 30,
  stamp: 24,
} as const;

export function parseHomeHero(data: Data): { ok: true; value: HomeHero } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const value = {} as HomeHero;

  for (const [key, max] of Object.entries(LIMITS) as [keyof typeof LIMITS, number][]) {
    value[key] = text(data, key);
    if (value[key].length > max) errors[key] = `Hasta ${max} caracteres.`;
  }
  if (!value.titleLine1 && !value.titleLine2) errors.titleLine1 = "Escribí el título (al menos una línea).";
  if (!value.primaryLabel) errors.primaryLabel = "Escribí el texto del botón principal.";

  value.primaryHref = text(data, "primaryHref");
  if (!INTERNAL_LINK.test(value.primaryHref)) errors.primaryHref = "Un link de la tienda que empiece con /, ej.: /tienda?categoria=stickers";
  value.secondaryHref = text(data, "secondaryHref");
  if (value.secondaryLabel && !INTERNAL_LINK.test(value.secondaryHref)) {
    errors.secondaryHref = "Un link de la tienda que empiece con /, ej.: /encargos";
  }
  if (!value.secondaryLabel) value.secondaryHref = "";

  const ids = ["product1", "product2", "product3"].map((key) => text(data, key)).filter(Boolean);
  if (new Set(ids).size !== ids.length) errors.product1 = "Elegí productos distintos para cada foto.";
  if (ids.some((id) => id.length > 64)) errors.product1 = "Producto inválido.";
  value.productIds = ids;

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

const audit = "INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)";

export function createHomeRepository(sql: QueryFn) {
  return {
    /** Saved values over the defaults, so a field added later never comes back empty. */
    async getHero(): Promise<HomeHero> {
      const [row] = (await sql.query("SELECT value FROM store_settings WHERE key = 'home_hero'")) as { value: Partial<HomeHero> }[];
      return { ...DEFAULT_HERO, ...(row?.value ?? {}) };
    },

    async saveHero(actor: { authUserId: string; email: string }, hero: HomeHero): Promise<void> {
      await sql.query(
        `WITH saved AS (
           INSERT INTO store_settings (key, value, updated_by) VALUES ('home_hero', $1::jsonb, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
           RETURNING key
         )
         ${audit} SELECT $3, $2, 'home.hero', 'home', key, $1::jsonb FROM saved`,
        [JSON.stringify(hero), actor.email, actor.authUserId],
      );
    },
  };
}

/**
 * Collage products: the chosen ones still visible in the store, in order, then
 * the default ones to fill empty slots. Always up to three.
 */
export function pickHeroProducts<T extends { id: string; slug: string }>(hero: HomeHero, products: T[]): T[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const chosen = hero.productIds.map((id) => byId.get(id)).filter((product): product is T => product !== undefined);
  const fill = DEFAULT_HERO_SLUGS.map((slug) => products.find((product) => product.slug === slug)).filter(
    (product): product is T => product !== undefined && !chosen.includes(product),
  );
  return [...chosen, ...fill].slice(0, 3);
}
