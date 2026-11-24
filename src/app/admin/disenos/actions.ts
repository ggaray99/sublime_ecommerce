"use server";

import { redirect } from "next/navigation";
import { DESIGN_STATUS_LABELS, DESIGN_STATUSES, MOCKUP_KINDS, type DesignStatus } from "@/lib/designs/kinds";
import { catalogChanged, dataError, formValues, requireAdmin, type AdminFormState } from "@/server/admin/guard";
import { getDesignRepository } from "@/server/admin/session";
import { createDesignWithFile, deleteDesignWithFiles, replaceDesignFile, type DesignFlowDeps } from "@/server/designs/admin-flow";
import type { DesignFileCheck } from "@/lib/designs/upload";
import { checkDesignFile, deleteDesignFiles, DesignFileError, prepareDesignFile, storeDesignFiles } from "@/server/designs/files";
import { parseDesignInput } from "@/server/designs/validation";
import { hasPrivateStorage } from "@/server/media/private-files";
import { hasMediaStorage } from "@/server/media/public-files";

const NO_STORAGE = "La carga de diseños no está configurada en este entorno (falta MEDIA_ROOT).";

/** The preview is public and the production file private: both areas are needed. */
const storageReady = () => hasMediaStorage() && hasPrivateStorage();

const flowDeps = (): DesignFlowDeps => ({
  repo: getDesignRepository(),
  prepare: prepareDesignFile,
  store: storeDesignFiles,
  remove: deleteDesignFiles,
});

const designPaths = (id?: string) => ["/admin/disenos", ...(id ? [`/admin/disenos/${id}`] : []), "/disenos"];

/**
 * Text fields plus the checked base products and colors, which arrive as one
 * "kinds" / "colors-<kind>" entry per box. Colors are checked against the base products'.
 */
async function readForm(form: FormData) {
  const kinds = form.getAll("kinds").map(String);
  const colors = Object.fromEntries(MOCKUP_KINDS.map((kind) => [`colors-${kind}`, form.getAll(`colors-${kind}`).map(String)]));
  const values: Record<string, string> = {
    ...formValues(form),
    kinds: kinds.join(","),
    ...Object.fromEntries(Object.entries(colors).map(([name, keys]) => [name, keys.join(",")])),
  };
  const kindColors = await getDesignRepository().listKindColors();
  return { values, parsed: parseDesignInput({ ...values, kinds, ...colors }, kindColors) };
}

async function readFile(form: FormData): Promise<Uint8Array | null> {
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return null;
  return new Uint8Array(await file.arrayBuffer());
}

/** Business and file errors become a message on the form; anything else is a real failure. */
function flowError(error: unknown, values?: Record<string, string>): AdminFormState {
  if (error instanceof DesignFileError) return { fields: { file: error.message }, values };
  return dataError(error, values);
}

export async function createDesignAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const { values, parsed } = await readForm(form);
  if (!storageReady()) return { error: NO_STORAGE, values };
  const bytes = await readFile(form);
  if (!parsed.ok || !bytes) {
    return { fields: { ...(parsed.ok ? {} : parsed.errors), ...(bytes ? {} : { file: "Elegí el archivo del diseño." }) }, values };
  }

  let created;
  try {
    created = await createDesignWithFile(flowDeps(), admin, parsed.value, bytes, { publish: values.publish === "on" });
  } catch (error) {
    return flowError(error, values);
  }
  catalogChanged(...designPaths(created.id));
  redirect(`/admin/disenos/${created.id}?creado=1${created.publishError ? "&publicar=error" : ""}`);
}

export async function updateDesignAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const { values, parsed } = await readForm(form);
  if (!parsed.ok) return { fields: parsed.errors, values };
  const id = values.designId ?? "";
  try {
    await getDesignRepository().updateDesign(admin, id, parsed.value);
  } catch (error) {
    return dataError(error, values);
  }
  catalogChanged(...designPaths(id));
  return { ok: "Cambios guardados.", values };
}

/** Checks a file as soon as the admin picks it, so a bad upload shows up before saving. Stores nothing. */
export async function checkDesignFileAction(form: FormData): Promise<DesignFileCheck> {
  await requireAdmin();
  const bytes = await readFile(form);
  if (!bytes) return { ok: false, error: "Elegí el archivo del diseño." };
  return checkDesignFile(bytes);
}

export async function uploadDesignFileAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  if (!storageReady()) return { error: NO_STORAGE };
  const id = String(form.get("designId") ?? "");
  const bytes = await readFile(form);
  if (!bytes) return { fields: { file: "Elegí el archivo del diseño." } };
  let warning: string | null;
  try {
    ({ warning } = await replaceDesignFile(flowDeps(), admin, id, bytes));
  } catch (error) {
    return flowError(error);
  }
  catalogChanged(...designPaths(id));
  return { ok: warning ? `Archivo actualizado. ${warning}` : "Archivo actualizado." };
}

export async function setDesignStatusAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const id = String(form.get("designId") ?? "");
  const status = String(form.get("status") ?? "") as DesignStatus;
  if (!DESIGN_STATUSES.includes(status)) return { error: "Elegí un estado de la lista." };
  try {
    await getDesignRepository().setDesignStatus(admin, id, status);
  } catch (error) {
    return dataError(error);
  }
  catalogChanged(...designPaths(id));
  return { ok: `Estado: ${DESIGN_STATUS_LABELS[status]}.` };
}

export async function deleteDesignAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const id = String(form.get("designId") ?? "");
  try {
    await deleteDesignWithFiles(flowDeps(), admin, id);
  } catch (error) {
    return dataError(error);
  }
  catalogChanged(...designPaths());
  redirect("/admin/disenos?eliminado=1");
}
