import { quoteProductTypes, validateQuote, type QuoteErrors } from "../../lib/quote.ts";
import { parsePesos } from "../admin/validation.ts";
import { argentinaToday, type NewCustomRequest, type QuoteResponse } from "./repository.ts";

type Data = Record<string, unknown>;
const text = (data: Data, key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");

export type RequestForm = Omit<NewCustomRequest, "customerId" | "file">;

/**
 * Server-side validation of the public form: the same rules the browser shows
 * (src/lib/quote.ts), plus the idempotency key and a honeypot field ("website")
 * that people never see and simple bots fill in.
 */
export function parseRequestForm(data: Data): { ok: true; value: RequestForm } | { ok: false; errors: QuoteErrors & { form?: string }; bot?: boolean } {
  if (text(data, "website")) return { ok: false, errors: { form: "No pudimos procesar la solicitud." }, bot: true };
  const input = {
    name: text(data, "name"),
    email: text(data, "email").toLowerCase(),
    productType: text(data, "productType"),
    quantity: text(data, "quantity"),
    idea: text(data, "idea"),
    reference: text(data, "reference"),
    file: null,
  };
  const errors: QuoteErrors & { form?: string } = validateQuote(input);
  const idempotencyKey = text(data, "idempotencyKey");
  if (!/^[A-Za-z0-9-]{8,120}$/.test(idempotencyKey)) errors.form = "Recargá la página e intentá de nuevo.";
  const slug = text(data, "productSlug");
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      idempotencyKey,
      contactName: input.name,
      contactEmail: input.email,
      productType: input.productType as (typeof quoteProductTypes)[number],
      quantity: Number(input.quantity),
      idea: input.idea,
      reference: input.reference,
      productSlug: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? slug : null,
    },
  };
}

/** The quote an admin sends: amount, optional deposit (informative), message, validity and lead time. */
export function parseQuoteResponse(data: Data, today = argentinaToday()): { ok: true; value: QuoteResponse } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const quoteMinor = parsePesos(text(data, "amount"));
  if (quoteMinor === null || quoteMinor <= 0 || quoteMinor > 1_000_000_000) errors.amount = "Indicá el total en pesos (ej.: 45.000).";

  const depositText = text(data, "deposit");
  const depositMinor = depositText ? parsePesos(depositText) : null;
  if (depositText && (depositMinor === null || depositMinor <= 0)) errors.deposit = "Seña en pesos o vacío.";
  else if (depositMinor !== null && quoteMinor !== null && depositMinor > quoteMinor) errors.deposit = "La seña no puede superar el total.";

  const message = text(data, "message");
  if (message.length > 1500) errors.message = "Hasta 1500 caracteres.";

  const validUntil = text(data, "validUntil");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil) || Number.isNaN(Date.parse(validUntil))) errors.validUntil = "Elegí hasta cuándo vale el presupuesto.";
  else if (validUntil < today) errors.validUntil = "La fecha ya pasó.";

  const etaText = text(data, "etaDays");
  const etaDays = etaText ? Number(etaText) : null;
  if (etaText && (!Number.isInteger(etaDays) || (etaDays as number) < 1 || (etaDays as number) > 180)) errors.etaDays = "Días de producción entre 1 y 180, o vacío.";

  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value: { quoteMinor: quoteMinor as number, depositMinor, message, validUntil, etaDays } };
}
