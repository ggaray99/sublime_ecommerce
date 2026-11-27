import type { Admin } from "./repository.ts";

/**
 * "Export selected" for the admin lists (products, orders, custom requests).
 * The browser POSTs the checked ids as JSON; the answer is a CSV attachment.
 * Kept free of Next.js imports so the guard and the validation are testable:
 * each route handler passes the admin it resolved from the session.
 */

/** A list page never shows more rows than this; a larger body is not ours. */
export const MAX_EXPORT_IDS = 500;

/** Orders and custom requests. */
export const UUID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Products: their legacy id (p08, x3k9…). */
export const PRODUCT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/i;

export type SelectedIds = { ok: true; ids: string[] } | { ok: false; message: string };

export function parseSelectedIds(body: unknown, idPattern: RegExp): SelectedIds {
  const ids = (body as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, message: "Elegí al menos un registro para exportar." };
  if (ids.length > MAX_EXPORT_IDS) return { ok: false, message: `Se pueden exportar hasta ${MAX_EXPORT_IDS} registros por vez.` };
  if (!ids.every((id) => typeof id === "string" && idPattern.test(id))) return { ok: false, message: "La selección tiene identificadores inválidos." };
  return { ok: true, ids: [...new Set(ids as string[])] };
}

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * Admin check first (404 for anyone else, like the catalog export), then a
 * JSON body with valid ids, then the file. The date in the name is Argentina's.
 */
export async function exportSelection(options: {
  admin: Admin | null;
  request: Request;
  idPattern: RegExp;
  filePrefix: string;
  build: (ids: string[]) => Promise<string>;
  /** Records the export in Admin › Actividad; if it fails, the file is not handed out. */
  audit: (admin: Admin, ids: string[]) => Promise<void>;
  now?: Date;
}): Promise<Response> {
  if (!options.admin) return text("No encontrado", 404);
  // JSON only: a cross-site HTML form cannot send it without a CORS preflight.
  if (!(options.request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return text("Formato no admitido", 415);
  let body: unknown;
  try {
    body = await options.request.json();
  } catch {
    return text("La selección no se pudo leer.", 400);
  }
  const selection = parseSelectedIds(body, options.idPattern);
  if (!selection.ok) return text(selection.message, 400);
  const csv = await options.build(selection.ids);
  try {
    await options.audit(options.admin, selection.ids);
  } catch (error) {
    // Personal data never leaves without a trace: no record, no file.
    console.error("selection export audit failed", error);
    return text("No pudimos exportar la selección. Probá de nuevo.", 500);
  }
  const date = new Date((options.now ?? new Date()).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${options.filePrefix}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
