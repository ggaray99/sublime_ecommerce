"use server";

import { redirect } from "next/navigation";
import { MAX_REQUESTS_PER_HOUR } from "@/server/custom-requests/repository";
import { customRequestsAvailable, getCustomRequestRepository } from "@/server/custom-requests/session";
import { parseRequestForm } from "@/server/custom-requests/validation";
import { getCurrentCustomer } from "@/server/customers/session";
import { ImageFileError } from "@/server/media/image-file";
import { deletePrivateFile, hasPrivateStorage, inspectAttachment, storePrivateFile } from "@/server/media/private-files";

export type RequestFormState = { error?: string; fields?: Record<string, string>; values?: Record<string, string> };

/**
 * Saves a custom request (staging/previews): validated on the server, limited
 * per email, the reference file checked by its bytes and kept in private
 * storage. Redirects to the request's private page.
 */
export async function submitCustomRequestAction(_state: RequestFormState, form: FormData): Promise<RequestFormState> {
  if (!customRequestsAvailable()) return { error: "Los encargos todavía no están habilitados en este sitio." };
  const values = Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === "string").map(([key, value]) => [key, String(value)]));
  const parsed = parseRequestForm(values);
  if (!parsed.ok) {
    // Bots get a generic answer and nothing is saved.
    return parsed.bot ? { error: parsed.errors.form } : { fields: parsed.errors as Record<string, string>, error: parsed.errors.form, values };
  }

  const repo = getCustomRequestRepository();
  const previous = await repo.findByIdempotencyKey(parsed.value.idempotencyKey);
  if (previous) redirect(`/encargo/${previous.id}?t=${previous.accessToken}`);
  if ((await repo.recentCountByEmail(parsed.value.contactEmail)) >= MAX_REQUESTS_PER_HOUR) {
    return { error: "Recibimos varias solicitudes de este email en la última hora. Probá más tarde o escribinos.", values };
  }

  const upload = form.get("file");
  let file: { pathname: string; originalName: string; contentType: string; sizeBytes: number } | null = null;
  if (upload instanceof File && upload.size > 0) {
    if (!hasPrivateStorage()) return { fields: { file: "La carga de archivos no está disponible: pegá un link en Referencia." }, values };
    try {
      const bytes = new Uint8Array(await upload.arrayBuffer());
      const info = inspectAttachment(bytes);
      const pathname = await storePrivateFile("encargos", bytes, info);
      file = { pathname, originalName: upload.name.slice(0, 160) || `referencia.${info.extension}`, contentType: info.type, sizeBytes: info.size };
    } catch (error) {
      if (error instanceof ImageFileError) return { fields: { file: error.message }, values };
      throw error;
    }
  }

  const customer = await getCurrentCustomer().catch(() => null);
  let created;
  try {
    created = await repo.create({ ...parsed.value, customerId: customer?.id ?? null, file });
  } catch (error) {
    if (file) await deletePrivateFile(file.pathname);
    throw error;
  }
  redirect(`/encargo/${created.id}?t=${created.accessToken}&nuevo=1`);
}
