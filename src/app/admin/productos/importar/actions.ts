"use server";

import { requireAdmin, catalogChanged } from "@/server/admin/guard";
import { importCatalog, type ImportReport } from "@/server/admin/csv";
import { getSql } from "@/server/db/client";

export type ImportState = { error?: string; report?: ImportReport; text?: string; fileName?: string };

const MAX_BYTES = 512 * 1024;

/** First a preview (nothing is written), then "Aplicar" sends the same text again. */
export async function importCatalogAction(_state: ImportState, form: FormData): Promise<ImportState> {
  const admin = await requireAdmin();
  const apply = form.get("apply") === "1";
  const file = form.get("file");
  let text = String(form.get("text") ?? "");
  let fileName = String(form.get("fileName") ?? "");
  if (!apply) {
    if (!(file instanceof File) || !file.size) return { error: "Elegí el archivo CSV." };
    if (file.size > MAX_BYTES) return { error: "El archivo supera 512 KB. Dividilo en partes." };
    text = await file.text();
    fileName = file.name;
  }
  const result = await importCatalog(getSql(), admin, text, !apply);
  if ("error" in result) return { error: result.error };
  if (apply) catalogChanged("/admin");
  return { report: result, text: apply ? undefined : text, fileName };
}
