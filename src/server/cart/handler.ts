import { quoteCart, type QuoteDeps } from "./quote.ts";
import { parseQuoteRequest } from "./validation.ts";

export const MAX_BODY_BYTES = 16 * 1024;

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Framework-independent handler for POST /api/cart/quote, so it can be tested
 * with plain Request objects and reused with any repository implementation.
 */
export async function handleCartQuote(
  request: Request,
  deps: QuoteDeps,
): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return json(415, { error: "unsupported_media_type", message: "Enviá el cuerpo como application/json." });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return json(413, { error: "payload_too_large", message: "El cuerpo supera el tamaño permitido." });
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return json(413, { error: "payload_too_large", message: "El cuerpo supera el tamaño permitido." });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "invalid_json", message: "El cuerpo no es JSON válido." });
  }

  const parsed = parseQuoteRequest(body);
  if (!parsed.ok) {
    return json(422, { error: "validation_failed", message: "Revisá los datos enviados.", fields: parsed.errors });
  }

  const quote = await quoteCart(parsed.lines, deps);
  return json(200, quote);
}
