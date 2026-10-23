import { MAX_CART_LINES, MAX_LINE_QUANTITY, type QuoteRequestLine } from "./quote.ts";

export type FieldError = { path: string; message: string };

export type ParseResult = { ok: true; lines: QuoteRequestLine[] } | { ok: false; errors: FieldError[] };

const PRODUCT_ID = /^[a-z0-9-]{1,40}$/i;
const SKU = /^[A-Z0-9][A-Z0-9-]{1,39}$/;

/**
 * Validates the POST /api/cart/quote body: `{ lines: [{ productId, quantity }] }`.
 * Unknown keys are rejected so clients cannot believe extra fields (like prices) are honored.
 */
export function parseQuoteRequest(body: unknown): ParseResult {
  const errors: FieldError[] = [];

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, errors: [{ path: "", message: "El cuerpo debe ser un objeto JSON." }] };
  }
  for (const key of Object.keys(body)) {
    if (key !== "lines") errors.push({ path: key, message: "Campo no admitido." });
  }

  const rawLines = (body as { lines?: unknown }).lines;
  if (!Array.isArray(rawLines)) {
    errors.push({ path: "lines", message: "Se requiere una lista de líneas." });
    return { ok: false, errors };
  }
  if (rawLines.length === 0) errors.push({ path: "lines", message: "El carrito está vacío." });
  if (rawLines.length > MAX_CART_LINES) errors.push({ path: "lines", message: `Máximo ${MAX_CART_LINES} líneas.` });

  const lines: QuoteRequestLine[] = [];
  rawLines.slice(0, MAX_CART_LINES).forEach((raw: unknown, index) => {
    const path = `lines[${index}]`;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      errors.push({ path, message: "Cada línea debe ser un objeto." });
      return;
    }
    const line = raw as Record<string, unknown>;
    for (const key of Object.keys(line)) {
      if (key !== "productId" && key !== "quantity" && key !== "sku") errors.push({ path: `${path}.${key}`, message: "Campo no admitido." });
    }
    if (typeof line.productId !== "string" || !PRODUCT_ID.test(line.productId)) {
      errors.push({ path: `${path}.productId`, message: "Identificador de producto inválido." });
    }
    if (
      typeof line.quantity !== "number" ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > MAX_LINE_QUANTITY
    ) {
      errors.push({ path: `${path}.quantity`, message: `La cantidad debe ser un entero entre 1 y ${MAX_LINE_QUANTITY}.` });
    }
    if (line.sku !== undefined && (typeof line.sku !== "string" || !SKU.test(line.sku))) {
      errors.push({ path: `${path}.sku`, message: "SKU inválido." });
    }
    if (typeof line.productId === "string" && typeof line.quantity === "number") {
      lines.push({ productId: line.productId, quantity: line.quantity, ...(typeof line.sku === "string" ? { sku: line.sku } : {}) });
    }
  });

  return errors.length ? { ok: false, errors } : { ok: true, lines };
}
