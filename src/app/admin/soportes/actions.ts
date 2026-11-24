"use server";

import { revalidatePath } from "next/cache";
import { isMockupKind, MOCKUP_KIND_LABELS } from "@/lib/designs/kinds";
import { isTemplateSlot, MOCKUP_TONES, type TemplateSlot } from "@/lib/designs/mockups";
import { catalogChanged, dataError, formValues, requireAdmin, type AdminFormState } from "@/server/admin/guard";
import { getDesignRepository, getMockupTemplateRepository } from "@/server/admin/session";
import { deleteMediaFile, readMediaFile, saveMediaFile } from "@/server/media/disk";
import { hasMediaStorage } from "@/server/media/public-files";
import { UNKNOWN_SLOT } from "@/server/mockups/templates-repository";
import { resetTemplate, updateTemplateArea, uploadTemplatePhoto, type TemplateFlowDeps } from "@/server/mockups/template-flow";
import { TemplatePhotoError } from "@/server/mockups/warp";

/** Links a product to a base kind (Remera, Taza…), or unlinks it with an empty value. */
export async function saveMockupBaseAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const kind = values.kind;
  if (!isMockupKind(kind)) return { error: "Ese tipo de soporte no existe.", values };
  // The admin lists products by their catalog id (legacy_id); the repository resolves it.
  const productId = (values.productId ?? "").trim() || null;
  try {
    await getDesignRepository().setMockupBase(admin, kind, productId);
  } catch (error) {
    return dataError(error, values);
  }
  catalogChanged("/admin/soportes", "/disenos");
  return { ok: productId ? `${MOCKUP_KIND_LABELS[kind]}: producto base guardado.` : `${MOCKUP_KIND_LABELS[kind]}: sin producto base.`, values };
}

const NO_STORAGE = "La carga de imágenes no está configurada en este entorno (falta MEDIA_ROOT).";

const templateDeps = (): TemplateFlowDeps => ({
  repo: getMockupTemplateRepository(),
  save: async (name, png) => `/media/${await saveMediaFile("public", "soportes", name, "png", png)}`,
  read: async (url) => (url.startsWith("/media/soportes/") ? readMediaFile("public", url.slice("/media/".length)) : null),
  remove: async (urls) => {
    await Promise.allSettled(urls.filter((url) => url.startsWith("/media/soportes/")).map((url) => deleteMediaFile("public", url.slice("/media/".length))));
  },
});

/**
 * The kind × tone × side a Soportes form is about: a generic light/dark slot or a
 * garment color key of a kind that comes in colors; null for anything else.
 */
function readSlot(form: FormData): TemplateSlot | null {
  const [kind, tone, side] = ["kind", "tone", "side"].map((key) => String(form.get(key) ?? ""));
  return isTemplateSlot(kind, tone, side) ? ({ kind, tone, side } as TemplateSlot) : null;
}

const hasGenericTone = (slot: TemplateSlot) => (MOCKUP_TONES as readonly string[]).includes(slot.tone);

function templateChanged() {
  catalogChanged("/admin/soportes", "/disenos");
  revalidatePath("/disenos/[slug]", "page");
}

/** A new photo for one template; the store uses it right away. */
export async function uploadTemplatePhotoAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  if (!hasMediaStorage()) return { error: NO_STORAGE };
  const slot = readSlot(form);
  if (!slot) return { error: UNKNOWN_SLOT };
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { fields: { file: "Elegí la foto." } };
  try {
    await uploadTemplatePhoto(templateDeps(), admin, slot, new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof TemplatePhotoError) return { fields: { file: error.message } };
    return dataError(error);
  }
  templateChanged();
  return { ok: "Foto guardada. Revisá la zona de estampa." };
}

/** Where the design goes on an uploaded photo, and the mug curve. */
export async function saveTemplateAreaAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  if (!hasMediaStorage()) return { error: NO_STORAGE };
  const slot = readSlot(form);
  if (!slot) return { error: UNKNOWN_SLOT };
  const number = (key: string) => Number(form.get(key));
  const curve = form.has("curve") ? number("curve") / 100 : null;
  try {
    await updateTemplateArea(templateDeps(), admin, slot, { left: number("left"), top: number("top"), width: number("width") }, curve);
  } catch (error) {
    return dataError(error);
  }
  templateChanged();
  return { ok: "Zona de estampa guardada." };
}

/** Back to the built-in image of a template. */
export async function resetTemplateAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const slot = readSlot(form);
  if (!slot) return { error: UNKNOWN_SLOT };
  try {
    await resetTemplate(templateDeps(), admin, slot);
  } catch (error) {
    return dataError(error);
  }
  templateChanged();
  return { ok: hasGenericTone(slot) ? "Se restableció la imagen original." : "Se quitó la foto propia: el color vuelve a usar la base." };
}
