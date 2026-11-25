import { slugify } from "../admin/validation.ts";

/** A design theme (temática). Separate from the product category; a design can have several. */
export type DesignTheme = { id: string; slug: string; label: string };

export const MAX_THEME_LABEL = 60;

/**
 * A theme name typed by the admin: trimmed, inner spaces collapsed, up to 60
 * characters. Its slug comes from the same helper the designs use, so two labels
 * that only differ in case, accents or punctuation ("Fútbol", "FUTBOL") are the same theme.
 */
export function parseThemeLabel(raw: unknown): { ok: true; label: string; slug: string } | { ok: false; error: string } {
  const label = (typeof raw === "string" ? raw : "").trim().replace(/\s+/g, " ");
  if (!label) return { ok: false, error: "Escribí el nombre de la temática." };
  if (label.length > MAX_THEME_LABEL) return { ok: false, error: `La temática puede tener hasta ${MAX_THEME_LABEL} caracteres.` };
  const slug = slugify(label);
  if (!slug) return { ok: false, error: "La temática necesita al menos una letra o un número." };
  return { ok: true, label, slug };
}
