import type { FieldErrors, Validated } from "../customers/validation.ts";

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const STOCK_REASONS = ["restock", "adjustment"] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

/** Upper bound for a single count; a typo like 10000000 should not pass silently. */
export const MAX_STOCK = 100_000;
/** $ 10.000.000 in centavos. */
export const MAX_PRICE_MINOR = 1_000_000_000;

export type ProductUpdateInput = { priceMinor: number | null; status: ProductStatus };
export type StockCountInput = { onHand: number; reason: StockReason; note: string };

type Reader = { get(name: string): FormDataEntryValue | null };
const text = (form: Reader, name: string) => String(form.get(name) ?? "").trim();

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

/** Quoted-on-request products have no price; everything else needs one. */
export function parseProductUpdate(form: Reader, requiresQuote: boolean): Validated<ProductUpdateInput> {
  const errors: FieldErrors<ProductUpdateInput> = {};
  const status = text(form, "status") as ProductStatus;
  if (!PRODUCT_STATUSES.includes(status)) errors.status = "Elegí un estado válido.";

  let priceMinor: number | null = null;
  const price = text(form, "price");
  if (requiresQuote) {
    if (price) errors.priceMinor = "Los productos a pedido se cotizan: dejá el precio vacío.";
  } else {
    priceMinor = parsePesos(price);
    if (priceMinor === null) errors.priceMinor = "Ingresá un precio en pesos, por ejemplo 2500 o 2.500,50.";
    else if (priceMinor === 0 || priceMinor > MAX_PRICE_MINOR) errors.priceMinor = "El precio debe ser mayor a $ 0 y hasta $ 10.000.000.";
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { priceMinor, status } };
}

export function parseStockCount(form: Reader): Validated<StockCountInput> {
  const errors: FieldErrors<StockCountInput> = {};
  const raw = text(form, "onHand");
  const onHand = Number(raw);
  if (!/^\d+$/.test(raw) || onHand > MAX_STOCK) errors.onHand = `Ingresá una cantidad entera entre 0 y ${MAX_STOCK}.`;

  const reason = text(form, "reason") as StockReason;
  if (!STOCK_REASONS.includes(reason)) errors.reason = "Elegí un motivo.";

  const note = text(form, "note");
  if (note.length > 200) errors.note = "La nota puede tener hasta 200 caracteres.";
  else if (reason === "adjustment" && !note) errors.note = "Explicá el ajuste (por ejemplo: rotura, recuento).";

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { onHand, reason, note } };
}
