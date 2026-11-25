/**
 * Filters of the public design catalog (/disenos): base product, garment color
 * and theme. Pure functions shared by the page and its tests; the filters live
 * in the URL so a filtered list can be shared.
 */
import { MOCKUP_KIND_LABELS, MOCKUP_KINDS, type MockupKind } from "./kinds.ts";
import type { GarmentColor } from "./mockups.ts";

/** A base product a design is offered on, with its enabled colors (empty without a Color option). */
export type DesignCardBase = { kind: MockupKind; colors: GarmentColor[] };

/** What the filters look at in a design card. */
export type DesignCardFacets = { bases: DesignCardBase[]; themes: { slug: string; label: string }[] };

export type DesignFilters = {
  kind: MockupKind | "todos";
  /** A garment color key (see colorKey). */
  color: string;
  /** A theme slug. */
  theme: string;
};

export const defaultDesignFilters: DesignFilters = { kind: "todos", color: "todos", theme: "todas" };

export type DesignFilterOptions = {
  kinds: { value: MockupKind; label: string }[];
  colors: GarmentColor[];
  themes: { slug: string; label: string }[];
};

/** URL parameter of each filter. */
const keys = { kind: "producto", color: "color", theme: "tematica" } as const;

/** The products, colors and themes present in the cards: kinds in catalog order, colors as first seen, themes by name. */
export function designFilterOptions(cards: readonly DesignCardFacets[]): DesignFilterOptions {
  const kinds = new Set<MockupKind>();
  const colors = new Map<string, GarmentColor>();
  const themes = new Map<string, { slug: string; label: string }>();
  for (const card of cards) {
    for (const base of card.bases) {
      kinds.add(base.kind);
      for (const color of base.colors) if (!colors.has(color.key)) colors.set(color.key, color);
    }
    for (const theme of card.themes) if (!themes.has(theme.slug)) themes.set(theme.slug, theme);
  }
  return {
    kinds: MOCKUP_KINDS.filter((kind) => kinds.has(kind)).map((kind) => ({ value: kind, label: MOCKUP_KIND_LABELS[kind] })),
    colors: [...colors.values()],
    themes: [...themes.values()].sort((a, b) => a.label.localeCompare(b.label, "es")),
  };
}

/** Reads the filters from the URL; a value that is not among the options falls back to "all". */
export function parseDesignFilters(params: { get(name: string): string | null }, options: DesignFilterOptions): DesignFilters {
  const pick = (value: string | null, allowed: readonly string[], fallback: string) =>
    value !== null && allowed.includes(value) ? value : fallback;
  return {
    kind: pick(params.get(keys.kind), options.kinds.map((kind) => kind.value), defaultDesignFilters.kind) as DesignFilters["kind"],
    color: pick(params.get(keys.color), options.colors.map((color) => color.key), defaultDesignFilters.color),
    theme: pick(params.get(keys.theme), options.themes.map((theme) => theme.slug), defaultDesignFilters.theme),
  };
}

/** Serializes the filters to a query string, omitting the ones not in use. */
export function designFiltersToSearch(filters: DesignFilters): string {
  const params = new URLSearchParams();
  if (filters.kind !== defaultDesignFilters.kind) params.set(keys.kind, filters.kind);
  if (filters.color !== defaultDesignFilters.color) params.set(keys.color, filters.color);
  if (filters.theme !== defaultDesignFilters.theme) params.set(keys.theme, filters.theme);
  const search = params.toString();
  return search ? `?${search}` : "";
}

/**
 * The first base product of the selected kind that comes in the selected color,
 * so product and color must match on the same base; null when none does.
 */
export function matchingBase<T extends DesignCardBase>(card: { bases: readonly T[] }, filters: DesignFilters): T | null {
  return (
    card.bases.find(
      (base) =>
        (filters.kind === defaultDesignFilters.kind || base.kind === filters.kind) &&
        (filters.color === defaultDesignFilters.color || base.colors.some((color) => color.key === filters.color)),
    ) ?? null
  );
}

/** The cards that match every filter in use, in their order. */
export function filterDesignCards<T extends DesignCardFacets>(cards: readonly T[], filters: DesignFilters): T[] {
  return cards.filter(
    (card) =>
      matchingBase(card, filters) !== null &&
      (filters.theme === defaultDesignFilters.theme || card.themes.some((theme) => theme.slug === filters.theme)),
  );
}
