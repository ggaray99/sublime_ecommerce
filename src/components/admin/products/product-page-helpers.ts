/**
 * Pure rules of the product page, the new-product page and the import page.
 * Plain .ts with type-only imports, so node --test can run them
 * (tests/admin-product-page.test.mjs). Business validation stays on the server.
 */
import type { ImportLine, ImportReport } from "../../../server/admin/csv.ts";
import type { ProductChangeResult } from "../../../server/admin/product-changes.ts";
import type { ProductStatus } from "../../../server/admin/validation.ts";
import type { BadgeTone } from "../ui/badge.tsx";

/** Status badge of a product: header and publication card. */
export const STATUS_BADGE: Record<ProductStatus, { label: string; tone: BadgeTone }> = {
  active: { label: "Publicado", tone: "success" },
  draft: { label: "Borrador", tone: "neutral" },
  archived: { label: "Archivado", tone: "attention" },
};

export type StatusAction = { status: ProductStatus; label: string; confirm: boolean };

/** The status changes the publication card offers from each status. */
export function statusActions(status: ProductStatus): StatusAction[] {
  switch (status) {
    case "draft":
      return [{ status: "active", label: "Publicar", confirm: false }];
    case "active":
      return [
        { status: "draft", label: "Pasar a borrador", confirm: false },
        { status: "archived", label: "Archivar", confirm: true },
      ];
    case "archived":
      return [
        { status: "draft", label: "Volver a borrador", confirm: false },
        { status: "active", label: "Publicar", confirm: false },
      ];
  }
}

export function statusDescription(status: ProductStatus): string {
  switch (status) {
    case "active":
      return "Publicado: se ve en la tienda y se puede comprar.";
    case "draft":
      return "En borrador: no se ve en la tienda. Publicalo cuando esté completo.";
    case "archived":
      return "Archivado: no se ve en la tienda. Queda en el panel con su historial.";
  }
}

const STATUS_IN_TEXT: Record<ProductStatus, string> = { active: "publicado", draft: "en borrador", archived: "archivado" };
const CHANGED_TEXT: Record<ProductStatus, string> = {
  active: "Producto publicado: ya se ve en la tienda.",
  draft: "El producto pasó a borrador: ya no se ve en la tienda.",
  archived: "Producto archivado: ya no se ve en la tienda.",
};
const FAILED_VERB: Record<ProductStatus, string> = { active: "publicar", draft: "pasar a borrador", archived: "archivar" };

export type StatusChangeMessage = { tone: "success" | "info" | "critical"; message: string };

/** What the publication card says after one product's status change. */
export function statusChangeMessage(result: ProductChangeResult, status: ProductStatus): StatusChangeMessage {
  const skipped = result.skipped[0];
  if (skipped) return { tone: "critical", message: `No se pudo ${FAILED_VERB[status]}: ${skipped.reason}` };
  if (result.changed.length) return { tone: "success", message: CHANGED_TEXT[status] };
  return { tone: "info", message: `El producto ya estaba ${STATUS_IN_TEXT[status]}.` };
}

/** Preview of the movement a stock count records ("Se registra +5"). Null while the count is not a whole number. */
export function stockDifference(currentOnHand: number, counted: string): { delta: number; text: string } | null {
  const text = counted.trim();
  if (!/^\d+$/.test(text)) return null;
  const delta = Number(text) - currentOnHand;
  if (delta === 0) return { delta, text: "Sin diferencia con el stock en depósito." };
  return { delta, text: `Se registra ${delta > 0 ? "+" : "−"}${Math.abs(delta)}` };
}

export type ErrorSummaryItem = { field: string; label: string | null; message: string };

/** Invalid fields in the form's order (the order of `labels`); errors without a field label go last. */
export function errorSummaryItems(fields: Record<string, string | undefined> | undefined, labels: Record<string, string>): ErrorSummaryItem[] {
  if (!fields) return [];
  const order = Object.keys(labels);
  const rank = (field: string) => (order.includes(field) ? order.indexOf(field) : order.length);
  return Object.entries(fields)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([field, message]) => ({ field, label: labels[field] ?? null, message }));
}

/** The import review shows what changes (new, changed, errors); unchanged rows only as a count. */
export function importReview(report: ImportReport): { rows: ImportLine[]; unchanged: number } {
  return { rows: report.lines.filter((line) => line.result !== "unchanged"), unchanged: report.summary.unchanged };
}
