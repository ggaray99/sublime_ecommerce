import { isMockupKind, MOCKUP_KIND_LABELS, MOCKUP_KINDS, type MockupKind } from "../../lib/designs/kinds.ts";
import type { GarmentColor } from "../../lib/designs/mockups.ts";
import { slugify } from "../admin/validation.ts";
import type { FieldErrors, Validated } from "../customers/validation.ts";

export type DesignInput = {
  name: string;
  slug: string;
  description: string;
  categoryId: string | null;
  kinds: MockupKind[];
  /**
   * The garment color keys (see colorKey) the design is offered on, per kind. A
   * kind without an entry is offered on every color of its base product.
   */
  colors: Partial<Record<MockupKind, string[]>>;
  /** The design's themes (temáticas), as design_themes ids in the order of the theme list. */
  themeIds: string[];
};

/** The colors each kind's base product comes in (listKindColors); kinds without colors are missing. */
export type KindColors = Partial<Record<MockupKind, GarmentColor[]>>;

type Data = Record<string, unknown>;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CATEGORY_ID = /^[a-z0-9-]{1,40}$/;
const MAX_DESCRIPTION = 2000;
const THEME_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const str = (data: Data, key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");

/** A form sends one string per checked box; the JSON API sends an array. */
function values(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "string" && value ? [value] : [];
}

/** The colors posted for a kind: one "colors-<kind>" entry per checked box, or `colors: { kind: [...] }` from JSON. */
function postedColors(data: Data, kind: MockupKind): string[] {
  const nested = data.colors && typeof data.colors === "object" ? (data.colors as Data)[kind] : undefined;
  return [...values(data[`colors-${kind}`]), ...values(nested)];
}

/**
 * Name, URL, description, category, the base products a design is offered on
 * and, for each checked kind whose base product comes in colors, the colors.
 * Colors of unchecked kinds are ignored. Themes arrive as one "themes" entry per
 * checked box (or `themeIds` from JSON); with `themes` (listThemes) they must be
 * in that list and keep its order, otherwise only their format is checked.
 */
export function parseDesignInput(data: Data, kindColors: KindColors = {}, themes?: readonly { id: string }[]): Validated<DesignInput> {
  const errors: FieldErrors<DesignInput> = {};
  const name = str(data, "name");
  if (!name) errors.name = "Poné un nombre para el diseño.";
  else if (name.length > 120) errors.name = "El nombre puede tener hasta 120 caracteres.";

  const slug = str(data, "slug").toLowerCase() || slugify(name);
  if (!SLUG.test(slug) || slug.length > 80) errors.slug = "Usá solo minúsculas, números y guiones (ej.: gato-astronauta).";

  const description = str(data, "description");
  if (description.length > MAX_DESCRIPTION) errors.description = `La descripción puede tener hasta ${MAX_DESCRIPTION} caracteres.`;

  const categoryId = str(data, "categoryId") || null;
  if (categoryId && !CATEGORY_ID.test(categoryId)) errors.categoryId = "Elegí una categoría de la lista.";

  const picked = values(data.kinds);
  if (picked.some((kind) => !isMockupKind(kind))) errors.kinds = "Elegí productos de la lista.";
  // Stable order, no duplicates.
  const kinds = MOCKUP_KINDS.filter((kind) => picked.includes(kind));

  const colors: DesignInput["colors"] = {};
  for (const kind of kinds) {
    const available = kindColors[kind] ?? [];
    const posted = postedColors(data, kind);
    const noun = MOCKUP_KIND_LABELS[kind].toLowerCase();
    const unknown = posted.find((key) => !available.some((color) => color.key === key));
    if (unknown !== undefined) {
      errors.colors ??= `Elegí colores de la lista: «${unknown.slice(0, 40)}» no es un color de ${noun}.`;
    } else if (available.length) {
      // Base product order, no duplicates.
      const chosen = available.filter((color) => posted.includes(color.key)).map((color) => color.key);
      if (chosen.length) colors[kind] = chosen;
      else errors.colors ??= `Elegí al menos un color de ${noun}.`;
    }
  }

  const pickedThemes = [...values(data.themes), ...values(data.themeIds)];
  if (pickedThemes.some((id) => !THEME_ID.test(id) || (themes && !themes.some((theme) => theme.id === id)))) {
    errors.themeIds = "Elegí temáticas de la lista.";
  }
  // Theme list order (or first-posted order without a list), no duplicates.
  const themeIds = themes ? themes.map((theme) => theme.id).filter((id) => pickedThemes.includes(id)) : [...new Set(pickedThemes)];

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, slug, description, categoryId, kinds, colors, themeIds } };
}
