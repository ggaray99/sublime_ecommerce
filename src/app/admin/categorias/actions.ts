"use server";

import { redirect } from "next/navigation";
import { catalogChanged, dataError, formValues, requireAdmin, type AdminFormState } from "@/server/admin/guard";
import { getCategoryRepository } from "@/server/admin/session";
import { parseCategoryCreate, parseCategoryUpdate } from "@/server/admin/validation";
import { deleteStoredImage, hasMediaStorage, storeImage } from "@/server/media/public-files";
import { ImageFileError, inspectImage, type ImageInfo } from "@/server/media/image-file";
import type { Admin } from "@/server/admin/repository";

/** Forms send the checkbox only when it is checked; the validator expects "on"/"off". */
const withActive = (values: Record<string, string>): Record<string, string> => ({ ...values, active: values.active ?? "off" });

/** The optional photo of the create form: validated before the category exists. */
async function readOptionalImage(form: FormData): Promise<{ bytes: Uint8Array; info: ImageInfo } | null | { error: string }> {
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return null;
  if (!hasMediaStorage()) return { error: "La carga de imágenes no está configurada en este entorno." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    return { bytes, info: inspectImage(bytes) };
  } catch (error) {
    if (error instanceof ImageFileError) return { error: error.message };
    throw error;
  }
}

/** Stores the photo and points the category at it; the previous photo is removed. */
async function replaceCategoryImage(admin: Admin, categoryId: string, bytes: Uint8Array, info: ImageInfo) {
  const stored = await storeImage(`categorias/${categoryId}`, bytes, info);
  try {
    const previous = await getCategoryRepository().setCategoryImage(admin, categoryId, stored.url);
    await deleteStoredImage(previous);
  } catch (error) {
    await deleteStoredImage(stored.url);
    throw error;
  }
}

export async function createCategoryAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = withActive(formValues(form));
  const parsed = parseCategoryCreate(values);
  if (!parsed.ok) return { fields: parsed.errors, values };
  const image = await readOptionalImage(form);
  if (image && "error" in image) return { fields: { file: image.error }, values };
  try {
    await getCategoryRepository().createCategory(admin, parsed.value);
  } catch (error) {
    return dataError(error, values);
  }
  let imageFailed = false;
  if (image) {
    try {
      await replaceCategoryImage(admin, parsed.value.id, image.bytes, image.info);
    } catch (error) {
      // The category exists: never lose it because the photo failed. Its page offers the upload again.
      console.error("[admin] category image upload failed", error);
      imageFailed = true;
    }
  }
  catalogChanged("/admin/categorias");
  redirect(`/admin/categorias/${parsed.value.id}?creada=1${imageFailed ? "&imagen=error" : ""}`);
}

export async function updateCategoryAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = withActive(formValues(form));
  const parsed = parseCategoryUpdate(values);
  if (!parsed.ok) return { fields: parsed.errors, values };
  try {
    await getCategoryRepository().updateCategory(admin, values.categoryId ?? "", parsed.value);
  } catch (error) {
    return dataError(error, values);
  }
  catalogChanged("/admin/categorias", `/admin/categorias/${values.categoryId}`);
  return { ok: "Cambios guardados.", values };
}

export async function uploadCategoryImageAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  if (!hasMediaStorage()) return { error: "La carga de imágenes no está configurada en este entorno." };
  const categoryId = String(form.get("categoryId") ?? "");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { fields: { file: "Elegí una imagen." } };

  try {
    const repo = getCategoryRepository();
    await repo.getCategory(categoryId);
    const bytes = new Uint8Array(await file.arrayBuffer());
    await replaceCategoryImage(admin, categoryId, bytes, inspectImage(bytes));
  } catch (error) {
    return dataError(error);
  }
  catalogChanged("/admin/categorias", `/admin/categorias/${categoryId}`);
  return { ok: "Imagen actualizada." };
}

export async function deleteCategoryAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const categoryId = String(form.get("categoryId") ?? "");
  try {
    const imageUrl = await getCategoryRepository().deleteCategory(admin, categoryId);
    await deleteStoredImage(imageUrl);
  } catch (error) {
    return dataError(error);
  }
  catalogChanged("/admin/categorias");
  redirect("/admin/categorias?eliminada=1");
}
