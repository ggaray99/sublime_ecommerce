import type { FieldErrors, Validated } from "../customers/validation.ts";

/**
 * Variants are the combinations of up to two options (e.g. Talle × Color).
 * These helpers are pure so the panel, the API and the tests share them.
 */

export type OptionDefinition = { name: string; values: string[] };
export type VariantOptions = Record<string, string>;

export const MAX_OPTIONS = 2;
export const MAX_VALUES_PER_OPTION = 20;
export const MAX_VARIANTS = 30;

type Data = Record<string, unknown>;
const text = (data: Data, key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");

/** Accepts the form shape (option1Name / option1Values "S, M, L") or JSON ([{ name, values }]). */
export function parseOptionDefinitions(data: Data): Validated<OptionDefinition[]> {
  const errors: Record<string, string> = {};
  const raw: { name: unknown; values: unknown }[] = Array.isArray(data.options)
    ? (data.options as { name: unknown; values: unknown }[])
    : [1, 2].map((n) => ({ name: text(data, `option${n}Name`), values: text(data, `option${n}Values`) }));

  const definitions: OptionDefinition[] = [];
  raw.forEach((option, index) => {
    const key = `option${index + 1}`;
    const name = String(option?.name ?? "").trim();
    const values = (Array.isArray(option?.values) ? option.values : String(option?.values ?? "").split(","))
      .map((value) => String(value).trim())
      .filter(Boolean);
    if (!name && !values.length) return;
    if (!name || name.length > 30) errors[`${key}Name`] = "Nombre de 1 a 30 caracteres (ej.: Talle).";
    if (!values.length) errors[`${key}Values`] = "Indicá al menos un valor, separados por coma.";
    else if (values.length > MAX_VALUES_PER_OPTION || values.some((value) => value.length > 30)) {
      errors[`${key}Values`] = `Hasta ${MAX_VALUES_PER_OPTION} valores de 30 caracteres como máximo.`;
    } else if (new Set(values.map((value) => value.toLowerCase())).size !== values.length) {
      errors[`${key}Values`] = "Hay valores repetidos.";
    }
    definitions.push({ name, values });
  });

  if (definitions.length > MAX_OPTIONS) errors.options = `Hasta ${MAX_OPTIONS} opciones por producto.`;
  if (definitions.length === 2 && definitions[0].name.toLowerCase() === definitions[1].name.toLowerCase()) {
    errors.option2Name = "Las dos opciones no pueden llamarse igual.";
  }
  if (!definitions.length) errors.option1Name = "Definí al menos una opción (ej.: Talle: S, M, L).";
  const total = definitions.reduce((count, option) => count * option.values.length, 1);
  if (definitions.length && total > MAX_VARIANTS) errors.options = `Son ${total} combinaciones: el máximo es ${MAX_VARIANTS}.`;

  return Object.keys(errors).length
    ? { ok: false, errors: errors as FieldErrors<OptionDefinition[]> }
    : { ok: true, value: definitions };
}

/** Every combination, in the order the values were written (first option varies slowest). */
export function combinations(definitions: readonly OptionDefinition[]): VariantOptions[] {
  return definitions.reduce<VariantOptions[]>(
    (combos, option) => combos.flatMap((combo) => option.values.map((value) => ({ ...combo, [option.name]: value }))),
    [{}],
  );
}

/** Stable comparison key for a combination, independent of key order. */
export const optionsKey = (options: VariantOptions) =>
  JSON.stringify(
    Object.keys(options)
      .sort()
      .map((key) => [key, options[key]]),
  );

/** "Talle M · Color Negro" */
export const optionsLabel = (options: VariantOptions, names: readonly string[]) =>
  names
    .filter((name) => options[name])
    .map((name) => `${name} ${options[name]}`)
    .join(" · ");

const skuPart = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 8);

/** SKU for a combination: base SKU + values, e.g. SUB-P13-M-NEGRO; unique within `taken`. */
export function variantSku(base: string, options: VariantOptions, names: readonly string[], taken: ReadonlySet<string>): string {
  const suffix = names.map((name) => skuPart(options[name] ?? "")).filter(Boolean).join("-") || "V";
  const stem = `${base.slice(0, 40 - suffix.length - 4)}-${suffix}`.replace(/-+/g, "-");
  if (!taken.has(stem)) return stem;
  for (let n = 2; ; n++) {
    const candidate = `${stem.slice(0, 37)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export type ExistingVariant = { id: string; sku: string; options: VariantOptions; active: boolean; isDefault: boolean };

export type VariantPlan = {
  names: string[];
  updates: { id: string; options: VariantOptions; active: boolean; sortOrder: number }[];
  inserts: { sku: string; options: VariantOptions; sortOrder: number }[];
};

/**
 * What changes when the options are (re)defined:
 * - existing variants keep their values, re-keyed by position if an option is renamed;
 * - the single original variant takes the first combination;
 * - combinations that no longer exist are deactivated (never deleted: stock history);
 * - missing combinations are created with a generated SKU.
 */
export function planVariants(
  previousNames: readonly string[],
  definitions: readonly OptionDefinition[],
  existing: readonly ExistingVariant[],
  baseSku: string,
): VariantPlan {
  const names = definitions.map((option) => option.name);
  const targets = combinations(definitions);
  const targetIndex = new Map(targets.map((combo, index) => [optionsKey(combo), index]));

  const rekeyed = existing.map((variant) => {
    const options: VariantOptions = {};
    previousNames.forEach((oldName, position) => {
      const value = variant.options[oldName];
      if (value !== undefined && names[position]) options[names[position]] = value;
    });
    return { ...variant, options };
  });
  // A newly added option (or a product that had none) is filled with its first value, so
  // existing variants keep their SKU and stock: M becomes M-Negro, the single variant becomes S.
  for (const variant of rekeyed) {
    const missing = definitions.filter((option) => variant.options[option.name] === undefined);
    if (!missing.length) continue;
    const filled = { ...variant.options };
    for (const option of missing) filled[option.name] = option.values[0];
    const taken = rekeyed.some((other) => other !== variant && optionsKey(other.options) === optionsKey(filled));
    if (!taken) variant.options = filled;
  }
  // Still incomplete (its natural combination was taken): use any free combination.
  for (const variant of rekeyed) {
    if (definitions.every((option) => variant.options[option.name] !== undefined)) continue;
    const free = targets.find((combo) => !rekeyed.some((other) => optionsKey(other.options) === optionsKey(combo)));
    if (free) variant.options = { ...free };
  }

  // Dropping an option can make two variants equal (M-Negro and M-Blanco → M): the first
  // one stays; the rest keep their previous values and are deactivated.
  const seen = new Set<string>();
  const updates = rekeyed.map((variant, position) => {
    const key = optionsKey(variant.options);
    if (seen.has(key)) {
      return { id: variant.id, options: existing[position].options, active: false, sortOrder: targets.length };
    }
    seen.add(key);
    const index = targetIndex.get(key);
    return { id: variant.id, options: variant.options, active: index !== undefined, sortOrder: index ?? targets.length };
  });
  const present = new Set(rekeyed.map((variant) => optionsKey(variant.options)));
  const taken = new Set(existing.map((variant) => variant.sku));
  const inserts = targets
    .map((combo, index) => ({ combo, index }))
    .filter(({ combo }) => !present.has(optionsKey(combo)))
    .map(({ combo, index }) => {
      const sku = variantSku(baseSku, combo, names, taken);
      taken.add(sku);
      return { sku, options: combo, sortOrder: index };
    });
  return { names, updates, inserts };
}
