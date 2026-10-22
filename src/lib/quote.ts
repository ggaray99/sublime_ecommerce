export const quoteProductTypes = [
  "Stickers troquelados",
  "Pack de stickers",
  "Remeras e indumentaria",
  "Planchas DTF",
  "Vinilos",
  "Etiquetas para marca",
  "Otro",
] as const;

export const ACCEPTED_FILE_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_QUOTE_QUANTITY = 100000;

export type QuoteFile = { name: string; size: number; type: string };

export type QuoteInput = {
  name: string;
  email: string;
  productType: string;
  quantity: string;
  idea: string;
  reference: string;
  file: QuoteFile | null;
};

export type QuoteField = keyof QuoteInput;
export type QuoteErrors = Partial<Record<QuoteField, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateQuote(input: QuoteInput): QuoteErrors {
  const errors: QuoteErrors = {};
  const name = input.name.trim();
  const quantity = Number(input.quantity);

  if (name.length < 2) errors.name = "Ingresá tu nombre (al menos 2 caracteres).";
  else if (name.length > 80) errors.name = "El nombre puede tener hasta 80 caracteres.";

  if (!input.email.trim()) errors.email = "Ingresá un email de contacto.";
  else if (!EMAIL.test(input.email.trim())) errors.email = "Revisá el formato del email (por ejemplo, nombre@dominio.com).";

  if (!(quoteProductTypes as readonly string[]).includes(input.productType)) errors.productType = "Elegí un tipo de producto.";

  if (!input.quantity.trim()) errors.quantity = "Indicá una cantidad aproximada.";
  else if (!Number.isInteger(quantity) || quantity < 1) errors.quantity = "La cantidad tiene que ser un número entero mayor a 0.";
  else if (quantity > MAX_QUOTE_QUANTITY) errors.quantity = "Para cantidades tan grandes, contanos el detalle en la descripción.";

  const idea = input.idea.trim();
  if (idea.length < 20) errors.idea = "Contanos tu idea con un poco más de detalle (mínimo 20 caracteres).";
  else if (idea.length > 1500) errors.idea = "La descripción puede tener hasta 1500 caracteres.";

  if (input.reference.length > 300) errors.reference = "La referencia puede tener hasta 300 caracteres.";

  if (input.file) {
    if (!(ACCEPTED_FILE_TYPES as readonly string[]).includes(input.file.type)) {
      errors.file = "Formato no admitido. Usá PNG, JPG, WEBP o PDF.";
    } else if (input.file.size > MAX_FILE_BYTES) {
      errors.file = "El archivo supera los 5 MB.";
    }
  }

  return errors;
}
