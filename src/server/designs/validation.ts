import { isMockupKind, MOCKUP_KINDS, type MockupKind } from "../../lib/designs/kinds.ts";
import { slugify } from "../admin/validation.ts";
import type { FieldErrors, Validated } from "../customers/validation.ts";

export type DesignInput = {
  name: string;
  slug: string;
  description: string;
  categoryId: string | null;
  kinds: MockupKind[];
};

type Data = Record<string, unknown>;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CATEGORY_ID = /^[a-z0-9-]{1,40}$/;
const MAX_DESCRIPTION = 2000;

const str = (data: Data, key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");

/** A form sends one string per checked box; the JSON API sends an array. */
function values(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "string" && value ? [value] : [];
}

/** Name, URL, description, category and the base products a design is offered on. */
export function parseDesignInput(data: Data): Validated<DesignInput> {
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

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, slug, description, categoryId, kinds } };
}
