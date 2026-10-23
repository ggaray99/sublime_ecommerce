import { categories } from "../../data/categories.ts";
import { themes } from "../../data/products.ts";
import type { FieldErrors, Validated } from "../customers/validation.ts";

/**
 * Validation for catalog administration. It takes plain objects so the same
 * rules serve the admin forms (FormData → object) and the future JSON API.
 */

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const STOCK_REASONS = ["restock", "adjustment"] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

/** Upper bound for a single count; a typo like 10000000 should not pass silently. */
export const MAX_STOCK = 100_000;
/** $ 10.000.000 in centavos. */
export const MAX_PRICE_MINOR = 1_000_000_000;
export const MAX_TAGS = 20;
export const MAX_DETAILS = 12;

export type ProductContentInput = {
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  theme: string;
  tags: string[];
  details: string[];
  featured: boolean;
  catalogCode: string | null;
};
export type ProductUpdateInput = ProductContentInput & { priceMinor: number | null; status: ProductStatus };
export type ProductCreateInput = ProductUpdateInput & { requiresQuote: boolean; sku: string | null; initialStock: number };
export type StockCountInput = { onHand: number; reason: StockReason; note: string };

type Data = Record<string, unknown>;
type Errors = Record<string, string>;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9][A-Z0-9-]{1,39}$/;
const CATALOG_CODE = /^[0-9]{3,6}$/;
const CATEGORY_IDS = new Set<string>(categories.map((category) => category.id));

const str = (data: Data, key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");
const bool = (value: unknown) => value === true || value === "on" || value === "true";

/** Accepts an array (JSON) or text separated by commas/new lines (forms). */
function list(value: unknown, separator: RegExp): string[] {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(separator) : [];
  return items.map((item) => String(item).trim()).filter(Boolean);
}

/** "Remera Ruido Visual!" → "remera-ruido-visual". */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

/**
 * Parses an ARS amount typed by a person ("2500", "2.500", "2500,50") into
 * centavos. Returns null when the text is not a valid amount.
 */
export function parsePesos(value: string): number | null {
  const compact = value.replace(/\s|\$/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(compact)) return null;
  const [whole, cents = ""] = compact.replace(/\./g, "").split(",");
  return Number(whole) * 100 + Number(cents.padEnd(2, "0"));
}

function parseContent(data: Data, errors: Errors): ProductContentInput {
  const name = str(data, "name");
  if (!name) errors.name = "Completá el nombre.";
  else if (name.length > 120) errors.name = "El nombre puede tener hasta 120 caracteres.";

  const slug = str(data, "slug").toLowerCase() || slugify(name);
  if (!SLUG.test(slug) || slug.length > 80) errors.slug = "Usá solo minúsculas, números y guiones (ej.: remera-ruido-visual).";

  const description = str(data, "description");
  if (description.length > 2000) errors.description = "La descripción puede tener hasta 2000 caracteres.";

  const categoryId = str(data, "categoryId");
  if (!CATEGORY_IDS.has(categoryId)) errors.categoryId = "Elegí una categoría.";

  const theme = str(data, "theme");
  if (!(theme in themes)) errors.theme = "Elegí una temática.";

  const tags = [...new Set(list(data.tags, /[,\n]/).map((tag) => tag.toLowerCase()))];
  if (tags.length > MAX_TAGS || tags.some((tag) => tag.length > 30)) {
    errors.tags = `Hasta ${MAX_TAGS} etiquetas de 30 caracteres como máximo.`;
  }

  const details = list(data.details, /\n/);
  if (details.length > MAX_DETAILS || details.some((detail) => detail.length > 200)) {
    errors.details = `Hasta ${MAX_DETAILS} líneas de 200 caracteres como máximo.`;
  }

  const catalogCode = str(data, "catalogCode") || null;
  if (catalogCode && !CATALOG_CODE.test(catalogCode)) errors.catalogCode = "El código de catálogo tiene de 3 a 6 dígitos.";

  return { name, slug, description, categoryId, theme, tags, details, featured: bool(data.featured), catalogCode };
}

/** Quoted-on-request products have no price; everything else needs one. */
function parsePrice(data: Data, requiresQuote: boolean, errors: Errors): number | null {
  const fromJson = data.priceMinor;
  const text = str(data, "price");
  const given = fromJson !== undefined && fromJson !== null && fromJson !== "" ? fromJson : text || null;
  if (requiresQuote) {
    if (given !== null) errors.price = "Los productos a pedido se cotizan: dejá el precio vacío.";
    return null;
  }
  const priceMinor = typeof given === "number" ? (Number.isInteger(given) ? given : null) : given === null ? null : parsePesos(String(given));
  if (priceMinor === null) errors.price = "Ingresá un precio en pesos, por ejemplo 2500 o 2.500,50.";
  else if (priceMinor <= 0 || priceMinor > MAX_PRICE_MINOR) errors.price = "El precio debe ser mayor a $ 0 y hasta $ 10.000.000.";
  return priceMinor;
}

function parseStatus(data: Data, errors: Errors, fallback?: ProductStatus): ProductStatus {
  const status = (str(data, "status") || fallback) as ProductStatus;
  if (!PRODUCT_STATUSES.includes(status)) errors.status = "Elegí un estado válido.";
  return status;
}

const result = <T>(value: T, errors: Errors): Validated<T> =>
  Object.keys(errors).length ? { ok: false, errors: errors as FieldErrors<T> } : { ok: true, value };

export function parseProductUpdate(data: Data, requiresQuote: boolean): Validated<ProductUpdateInput> {
  const errors: Errors = {};
  const content = parseContent(data, errors);
  return result({ ...content, priceMinor: parsePrice(data, requiresQuote, errors), status: parseStatus(data, errors) }, errors);
}

/** New products start as drafts unless told otherwise, so nothing half-loaded is sold. */
export function parseProductCreate(data: Data): Validated<ProductCreateInput> {
  const errors: Errors = {};
  const content = parseContent(data, errors);
  const requiresQuote = bool(data.requiresQuote);

  const sku = str(data, "sku").toUpperCase() || null;
  if (sku && !SKU.test(sku)) errors.sku = "El SKU usa mayúsculas, números y guiones (2 a 40 caracteres).";

  const rawStock = data.initialStock ?? "0";
  const initialStock = Number(typeof rawStock === "string" ? rawStock.trim() || "0" : rawStock);
  if (!Number.isInteger(initialStock) || initialStock < 0 || initialStock > MAX_STOCK) {
    errors.initialStock = `Ingresá una cantidad entera entre 0 y ${MAX_STOCK}.`;
  } else if (requiresQuote && initialStock > 0) {
    errors.initialStock = "Los productos a pedido no llevan stock.";
  }

  return result(
    {
      ...content,
      requiresQuote,
      priceMinor: parsePrice(data, requiresQuote, errors),
      status: parseStatus(data, errors, "draft"),
      sku,
      initialStock,
    },
    errors,
  );
}

export function parseStockCount(data: Data): Validated<StockCountInput> {
  const errors: Errors = {};
  const raw = String(data.onHand ?? "").trim();
  const onHand = Number(raw);
  if (!/^\d+$/.test(raw) || onHand > MAX_STOCK) errors.onHand = `Ingresá una cantidad entera entre 0 y ${MAX_STOCK}.`;

  const reason = str(data, "reason") as StockReason;
  if (!STOCK_REASONS.includes(reason)) errors.reason = "Elegí un motivo.";

  const note = str(data, "note");
  if (note.length > 200) errors.note = "La nota puede tener hasta 200 caracteres.";
  else if (reason === "adjustment" && !note) errors.note = "Explicá el ajuste (por ejemplo: rotura, recuento).";

  return result({ onHand, reason, note }, errors);
}
