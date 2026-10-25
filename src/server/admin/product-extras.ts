import type { QueryFn } from "../db/client.ts";
import { parsePesos } from "./validation.ts";

/**
 * "Venta y logística" of a product: weight and dimensions (carrier quotes),
 * cost (margins), stock alert threshold and sale price. Kept apart from the
 * main product form so each save is small and audited on its own.
 */
export type ProductExtras = {
  weightG: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  /** Cost of the default variant (other variants: CSV import or API). */
  costMinor: number | null;
  lowStockThreshold: number | null;
  salePercent: number | null;
  salePriceMinor: number | null;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
};

type Data = Record<string, unknown>;
const text = (data: Data, key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");

/** "12,5" cm → 125 mm. */
function cmToMm(raw: string): number | null | undefined {
  if (!raw) return null;
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0 || value > 300) return undefined;
  return Math.round(value * 10);
}

function intIn(raw: string, min: number, max: number): number | null | undefined {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

/** A datetime-local value typed in Argentina (UTC−3, no DST) → instant. */
export function argentinaDateTime(raw: string): Date | null | undefined {
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return undefined;
  const date = new Date(`${raw}:00-03:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Instant → datetime-local value in Argentina, for the form. */
export const toArgentinaInput = (date: Date | null) => (date ? new Date(date.getTime() - 3 * 3600_000).toISOString().slice(0, 16) : "");

export function parseProductExtras(
  data: Data,
  context: { hasOptions: boolean },
): { ok: true; value: ProductExtras } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const weightG = intIn(text(data, "weightG"), 1, 100000);
  if (weightG === undefined) errors.weightG = "Peso en gramos, de 1 a 100.000.";
  const dims = { lengthMm: cmToMm(text(data, "length")), widthMm: cmToMm(text(data, "width")), heightMm: cmToMm(text(data, "height")) };
  if (Object.values(dims).some((v) => v === undefined)) errors.length = "Medidas en centímetros, mayores a 0 y hasta 300.";
  const costRaw = text(data, "cost");
  const costMinor = costRaw ? parsePesos(costRaw) : null;
  if (costRaw && costMinor === null) errors.cost = "Costo en pesos, por ejemplo 1.700.";
  const lowStockThreshold = intIn(text(data, "lowStockThreshold"), 0, 100000);
  if (lowStockThreshold === undefined) errors.lowStockThreshold = "Un número de unidades (o vacío para usar el general).";

  const saleKind = text(data, "saleKind");
  let salePercent: number | null = null;
  let salePriceMinor: number | null = null;
  if (saleKind === "percent") {
    salePercent = intIn(text(data, "salePercent"), 1, 90) ?? null;
    if (salePercent === null) errors.salePercent = "Un porcentaje de 1 a 90.";
  } else if (saleKind === "price") {
    if (context.hasOptions) errors.salePrice = "Con variantes, la oferta es un porcentaje (se aplica a cada talle o color).";
    salePriceMinor = parsePesos(text(data, "salePrice"));
    if (salePriceMinor === null || salePriceMinor <= 0) errors.salePrice = "Precio de oferta en pesos, por ejemplo 1.500.";
  } else if (saleKind && saleKind !== "none") {
    errors.saleKind = "Elegí el tipo de oferta.";
  }
  const saleStartsAt = argentinaDateTime(text(data, "saleStartsAt"));
  const saleEndsAt = argentinaDateTime(text(data, "saleEndsAt"));
  if (saleStartsAt === undefined) errors.saleStartsAt = "Fecha y hora inválidas.";
  if (saleEndsAt === undefined) errors.saleEndsAt = "Fecha y hora inválidas.";
  if (saleStartsAt && saleEndsAt && saleEndsAt <= saleStartsAt) errors.saleEndsAt = "Tiene que terminar después de empezar.";

  if (Object.keys(errors).length) return { ok: false, errors };
  const noSale = !salePercent && !salePriceMinor;
  return {
    ok: true,
    value: {
      weightG: weightG ?? null,
      lengthMm: dims.lengthMm ?? null,
      widthMm: dims.widthMm ?? null,
      heightMm: dims.heightMm ?? null,
      costMinor,
      lowStockThreshold: lowStockThreshold ?? null,
      salePercent,
      salePriceMinor,
      saleStartsAt: noSale ? null : (saleStartsAt ?? null),
      saleEndsAt: noSale ? null : (saleEndsAt ?? null),
    },
  };
}

type Row = {
  weight_g: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  cost_minor: string | number | null;
  low_stock_threshold: number | null;
  sale_percent: number | null;
  sale_price_minor: string | number | null;
  sale_starts_at: Date | null;
  sale_ends_at: Date | null;
};

const num = (value: string | number | null) => (value === null ? null : Number(value));

export function createProductExtrasRepository(sql: QueryFn) {
  return {
    async get(productId: string): Promise<ProductExtras | null> {
      const [row] = (await sql.query(
        `SELECT p.weight_g, p.length_mm, p.width_mm, p.height_mm, v.cost_minor, p.low_stock_threshold,
                p.sale_percent, p.sale_price_minor, p.sale_starts_at, p.sale_ends_at
         FROM products p JOIN product_variants v ON v.product_id = p.id AND v.is_default
         WHERE p.legacy_id = $1`,
        [productId],
      )) as Row[];
      if (!row) return null;
      return {
        weightG: row.weight_g,
        lengthMm: row.length_mm,
        widthMm: row.width_mm,
        heightMm: row.height_mm,
        costMinor: num(row.cost_minor),
        lowStockThreshold: row.low_stock_threshold,
        salePercent: row.sale_percent,
        salePriceMinor: num(row.sale_price_minor),
        saleStartsAt: row.sale_starts_at ? new Date(row.sale_starts_at) : null,
        saleEndsAt: row.sale_ends_at ? new Date(row.sale_ends_at) : null,
      };
    },

    /** Saves everything in one statement with its audit entry. */
    async save(actor: { authUserId: string; email: string }, productId: string, extras: ProductExtras): Promise<boolean> {
      const rows = (await sql.query(
        `WITH product AS (
           UPDATE products SET weight_g = $2, length_mm = $3, width_mm = $4, height_mm = $5, low_stock_threshold = $6,
                  sale_percent = $7, sale_price_minor = $8, sale_starts_at = $9, sale_ends_at = $10, updated_at = now()
           WHERE legacy_id = $1 RETURNING id
         ),
         cost AS (
           UPDATE product_variants SET cost_minor = $11, updated_at = now()
           FROM product WHERE product_variants.product_id = product.id AND product_variants.is_default
           RETURNING product_variants.id
         ),
         logged AS (
           INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
           SELECT $12, $13, 'product.extras', 'product', $1, $14::jsonb FROM product
         )
         SELECT id FROM product`,
        [
          productId,
          extras.weightG,
          extras.lengthMm,
          extras.widthMm,
          extras.heightMm,
          extras.lowStockThreshold,
          extras.salePercent,
          extras.salePriceMinor,
          extras.saleStartsAt,
          extras.saleEndsAt,
          extras.costMinor,
          actor.authUserId,
          actor.email,
          JSON.stringify(extras),
        ],
      )) as { id: string }[];
      return rows.length > 0;
    },
  };
}
