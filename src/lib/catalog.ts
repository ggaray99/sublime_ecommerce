import type { CategoryId } from "../data/categories";
import type { Product, ThemeId } from "../data/products";

export type ProductType = "estandar" | "personalizado";
export type SortOption = "destacados" | "nombre-asc" | "nombre-desc" | "precio-asc" | "precio-desc";

export type CatalogFilters = {
  query: string;
  category: CategoryId | "todas";
  type: ProductType | "todos";
  theme: ThemeId | "todas";
  sort: SortOption;
};

export const defaultFilters: CatalogFilters = {
  query: "",
  category: "todas",
  type: "todos",
  theme: "todas",
  sort: "destacados",
};

export const sortOptions: { value: SortOption; label: string }[] = [
  { value: "destacados", label: "Destacados primero" },
  { value: "nombre-asc", label: "Nombre: A → Z" },
  { value: "nombre-desc", label: "Nombre: Z → A" },
  { value: "precio-asc", label: "Precio demo: menor a mayor" },
  { value: "precio-desc", label: "Precio demo: mayor a menor" },
];

export const typeOptions: { value: ProductType; label: string }[] = [
  { value: "estandar", label: "Estándar (carrito demo)" },
  { value: "personalizado", label: "Personalizado (a presupuestar)" },
];

/** URL keys used by /tienda. Kept in Spanish so shared links read naturally. */
const keys = { query: "q", category: "categoria", type: "tipo", theme: "tema", sort: "orden" } as const;

type ParamReader = { get(name: string): string | null };

export function parseFilters(
  params: ParamReader,
  valid: { categories: readonly string[]; themes: readonly string[] },
): CatalogFilters {
  const pick = <T extends string>(value: string | null, allowed: readonly string[], fallback: T): T =>
    value !== null && allowed.includes(value) ? (value as T) : fallback;

  return {
    query: (params.get(keys.query) ?? "").slice(0, 80),
    category: pick(params.get(keys.category), valid.categories, defaultFilters.category),
    type: pick(params.get(keys.type), typeOptions.map((option) => option.value), defaultFilters.type),
    theme: pick(params.get(keys.theme), valid.themes, defaultFilters.theme),
    sort: pick(params.get(keys.sort), sortOptions.map((option) => option.value), defaultFilters.sort),
  };
}

/** Serializes filters to a query string, omitting default values. */
export function filtersToSearch(filters: CatalogFilters): string {
  const params = new URLSearchParams();
  const query = filters.query.trim();
  if (query) params.set(keys.query, query);
  if (filters.category !== defaultFilters.category) params.set(keys.category, filters.category);
  if (filters.type !== defaultFilters.type) params.set(keys.type, filters.type);
  if (filters.theme !== defaultFilters.theme) params.set(keys.theme, filters.theme);
  if (filters.sort !== defaultFilters.sort) params.set(keys.sort, filters.sort);
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** Lowercases and strips accents so "futbol" matches "fútbol". */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const byName = (a: Product, b: Product) => a.name.localeCompare(b.name, "es");

/** Quoted products (price null) always go last when sorting by price. */
const byPrice = (direction: 1 | -1) => (a: Product, b: Product) => {
  if (a.price === null && b.price === null) return byName(a, b);
  if (a.price === null) return 1;
  if (b.price === null) return -1;
  return (a.price - b.price) * direction || byName(a, b);
};

export function filterProducts(products: readonly Product[], filters: CatalogFilters): Product[] {
  const terms = normalize(filters.query).split(/\s+/).filter(Boolean);

  const result = products.filter((product) => {
    if (filters.category !== "todas" && product.category !== filters.category) return false;
    if (filters.theme !== "todas" && product.theme !== filters.theme) return false;
    if (filters.type === "estandar" && product.requiresQuote) return false;
    if (filters.type === "personalizado" && !product.requiresQuote) return false;
    if (!terms.length) return true;
    const haystack = normalize(`${product.name} ${product.tags.join(" ")} ${product.code ?? ""}`);
    return terms.every((term) => haystack.includes(term));
  });

  switch (filters.sort) {
    case "nombre-asc":
      return result.sort(byName);
    case "nombre-desc":
      return result.sort((a, b) => byName(b, a));
    case "precio-asc":
      return result.sort(byPrice(1));
    case "precio-desc":
      return result.sort(byPrice(-1));
    default:
      return result.sort((a, b) => Number(b.featured) - Number(a.featured));
  }
}

export function relatedProducts(products: readonly Product[], product: Product, limit = 4): Product[] {
  const others = products.filter((candidate) => candidate.id !== product.id);
  const score = (candidate: Product) =>
    (candidate.category === product.category ? 2 : 0) + (candidate.theme === product.theme ? 1 : 0);
  return others
    .map((candidate, index) => ({ candidate, index, score: score(candidate) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

/** True when the product tracks stock and none is available (database catalog only). */
export const isOutOfStock = (product: Pick<Product, "stock">) => product.stock === 0;
