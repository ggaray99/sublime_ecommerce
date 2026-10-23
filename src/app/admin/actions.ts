"use server";

import { redirect } from "next/navigation";
import { catalogChanged, dataError, formValues, requireAdmin, type AdminFormState } from "@/server/admin/guard";
import { parseImageAlt, parseProductCreate, parseProductUpdate, parseStockCount } from "@/server/admin/validation";
import { getAdminRepository, getImageRepository } from "@/server/admin/session";
import { deleteStoredImage, hasBlobStorage, storeImage } from "@/server/media/blob";
import { inspectImage } from "@/server/media/image-file";
import type { ImageMove } from "@/server/admin/images-repository";

/**
 * Creates the product and, optionally, its first photo. The photo is validated
 * before the product exists, so a bad file never leaves a half-created product;
 * if only storing the photo fails, the product stays and the page says so.
 */
export async function createProductAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const parsed = parseProductCreate(values);
  if (!parsed.ok) return { fields: parsed.errors, values };

  const file = form.get("file");
  const photo = file instanceof File && file.size && hasBlobStorage() ? new Uint8Array(await file.arrayBuffer()) : null;
  let photoInfo: ReturnType<typeof inspectImage> | null = null;
  if (photo) {
    try {
      photoInfo = inspectImage(photo);
    } catch (error) {
      return { ...dataError(error, values), fields: { file: (error as Error).message } };
    }
  }

  let productId: string;
  try {
    productId = (await getAdminRepository().createProduct(admin, parsed.value)).id;
  } catch (error) {
    return dataError(error, values);
  }

  let photoFailed = false;
  if (photo && photoInfo) {
    let stored: { url: string; pathname: string } | null = null;
    try {
      stored = await storeImage(`productos/${productId}`, photo, photoInfo);
      const alt = values.alt?.trim().slice(0, 200) || parsed.value.name;
      await getImageRepository().addImage(admin, productId, { ...stored, alt, info: photoInfo });
    } catch (error) {
      console.warn("[admin] product created but its photo failed", { productId, error: (error as Error).message });
      if (stored) await deleteStoredImage(stored.url);
      photoFailed = true;
    }
  }
  catalogChanged();
  redirect(`/admin/productos/${productId}?creado=1${photoFailed ? "&imagen=error" : ""}`);
}

export async function updateProductAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const productId = values.productId ?? "";
  const repo = getAdminRepository();
  try {
    const product = await repo.getProduct(productId);
    const parsed = parseProductUpdate(values, product.requiresQuote);
    if (!parsed.ok) return { fields: parsed.errors, values };
    await repo.updateProduct(admin, productId, parsed.value);
  } catch (error) {
    return dataError(error, values);
  }
  catalogChanged(`/admin/productos/${productId}`);
  return { ok: "Cambios guardados.", values };
}

export async function countStockAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const productId = values.productId ?? "";
  const parsed = parseStockCount(values);
  if (!parsed.ok) return { fields: parsed.errors, values };
  try {
    await getAdminRepository().countStock(admin, productId, parsed.value);
  } catch (error) {
    return dataError(error, values);
  }
  catalogChanged(`/admin/productos/${productId}`);
  return { ok: "Stock actualizado." };
}

/**
 * Validates the file on the server (real type from its bytes, size, dimensions),
 * stores it in Blob and records it. If recording fails, the stored file is removed.
 */
export async function uploadProductImageAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  if (!hasBlobStorage()) return { error: "La carga de imágenes no está configurada en este entorno." };
  const values = formValues(form);
  const productId = values.productId ?? "";
  const alt = parseImageAlt(values);
  if (!alt.ok) return { fields: alt.errors, values };
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { fields: { file: "Elegí una imagen." }, values };

  let stored: { url: string; pathname: string } | null = null;
  try {
    await getAdminRepository().getProduct(productId);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = inspectImage(bytes);
    stored = await storeImage(`productos/${productId}`, bytes, info);
    await getImageRepository().addImage(admin, productId, { ...stored, alt: alt.value.alt, info });
  } catch (error) {
    if (stored) await deleteStoredImage(stored.url);
    return dataError(error, values);
  }
  catalogChanged(`/admin/productos/${productId}`);
  return { ok: "Imagen agregada." };
}

export async function updateImageAltAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const parsed = parseImageAlt(values);
  if (!parsed.ok) return { fields: parsed.errors, values };
  try {
    await getImageRepository().updateAlt(admin, values.productId ?? "", values.imageId ?? "", parsed.value.alt);
  } catch (error) {
    return dataError(error, values);
  }
  catalogChanged(`/admin/productos/${values.productId}`);
  return { ok: "Texto guardado.", values };
}

const MOVES: readonly ImageMove[] = ["first", "up", "down"];

export async function moveImageAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const { productId = "", imageId = "", move = "" } = formValues(form);
  if (!MOVES.includes(move as ImageMove)) return;
  await getImageRepository().moveImage(admin, productId, imageId, move as ImageMove);
  catalogChanged(`/admin/productos/${productId}`);
}

export async function removeImageAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const { productId = "", imageId = "" } = formValues(form);
  const url = await getImageRepository().removeImage(admin, productId, imageId);
  await deleteStoredImage(url);
  catalogChanged(`/admin/productos/${productId}`);
}
