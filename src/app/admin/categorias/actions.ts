"use server";

import { redirect } from "next/navigation";
import { catalogChanged, dataError, formValues, requireAdmin, type AdminFormState } from "@/server/admin/guard";
import { getCategoryRepository } from "@/server/admin/session";
import { parseCategoryCreate, parseCategoryUpdate } from "@/server/admin/validation";
import { deleteStoredImage, hasBlobStorage, storeImage } from "@/server/media/blob";
import { inspectImage } from "@/server/media/image-file";

/** Forms send the checkbox only when it is checked; the validator expects "on"/"off". */
const withActive = (values: Record<string, string>): Record<string, string> => ({ ...values, active: values.active ?? "off" });

export async function createCategoryAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = withActive(formValues(form));
  const parsed = parseCategoryCreate(values);
  if (!parsed.ok) return { fields: parsed.errors, values };
  try {
    await getCategoryRepository().createCategory(admin, parsed.value);
  } catch (error) {
    return dataError(error, values);
  }
  catalogChanged("/admin/categorias");
  redirect(`/admin/categorias/${parsed.value.id}?creada=1`);
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
  if (!hasBlobStorage()) return { error: "La carga de imágenes no está configurada en este entorno." };
  const categoryId = String(form.get("categoryId") ?? "");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { fields: { file: "Elegí una imagen." } };

  let stored: { url: string } | null = null;
  try {
    const repo = getCategoryRepository();
    await repo.getCategory(categoryId);
    const bytes = new Uint8Array(await file.arrayBuffer());
    stored = await storeImage(`categorias/${categoryId}`, bytes, inspectImage(bytes));
    const previous = await repo.setCategoryImage(admin, categoryId, stored.url);
    await deleteStoredImage(previous);
  } catch (error) {
    if (stored) await deleteStoredImage(stored.url);
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
