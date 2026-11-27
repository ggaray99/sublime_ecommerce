"use server";

import { redirect } from "next/navigation";
import { catalogChanged, dataError, formValues, requireAdmin, type AdminFormState } from "@/server/admin/guard";
import { parseImageAlt, parsePesos, parseProductCreate, parseProductUpdate, parseStockCount } from "@/server/admin/validation";
import { getAdminRepository, getImageRepository, getProductExtrasRepository, getVariantRepository } from "@/server/admin/session";
import { parseProductExtras } from "@/server/admin/product-extras";
import { parseOptionDefinitions } from "@/server/admin/variants";
import { deleteStoredImage, hasMediaStorage, storeImage } from "@/server/media/public-files";
import { inspectImage } from "@/server/media/image-file";
import type { ImageMove } from "@/server/admin/images-repository";
import { changeProducts } from "@/server/admin/product-changes";
import { PRODUCT_STATUSES, type ProductStatus } from "@/server/admin/validation";
import { statusChangeMessage } from "@/components/admin/products/product-page-helpers";

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
  const photo = file instanceof File && file.size && hasMediaStorage() ? new Uint8Array(await file.arrayBuffer()) : null;
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

/** "Venta y logística": weight, dimensions, cost, stock alert and sale price. */
export async function updateProductExtrasAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const productId = values.productId ?? "";
  try {
    const product = await getAdminRepository().getProduct(productId);
    const parsed = parseProductExtras(values, { hasOptions: product.optionNames.length > 0 });
    if (!parsed.ok) return { fields: parsed.errors, values };
    await getProductExtrasRepository().save(admin, productId, parsed.value);
  } catch (error) {
    return dataError(error, values);
  }
  catalogChanged(`/admin/productos/${productId}`);
  return { ok: "Precio y envío guardados.", values };
}

/**
 * Publication card: changes only the status, with the same validation and
 * `product.update` audit entry as saving the product form (changeProducts).
 * A product the form would refuse (e.g. without price) keeps its status and
 * the card shows the reason.
 */
export async function setProductStatusAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const { productId = "", status = "" } = formValues(form);
  if (!PRODUCT_STATUSES.includes(status as ProductStatus)) return { error: "Elegí un estado válido." };
  let message: ReturnType<typeof statusChangeMessage>;
  try {
    const result = await changeProducts(getAdminRepository(), admin, [productId], { status: status as ProductStatus });
    message = statusChangeMessage(result, status as ProductStatus);
  } catch (error) {
    return dataError(error);
  }
  if (message.tone === "critical") return { error: message.message };
  catalogChanged(`/admin/productos/${productId}`);
  return { ok: message.message };
}

export async function countStockAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const productId = values.productId ?? "";
  const parsed = parseStockCount(values);
  if (!parsed.ok) return { fields: parsed.errors, values };
  try {
    // `sku` picks the variant of products with options; the default variant otherwise.
    await getAdminRepository().countStock(admin, productId, parsed.value, values.sku || undefined);
  } catch (error) {
    return dataError(error, values);
  }
  catalogChanged(`/admin/productos/${productId}`);
  return { ok: "Stock actualizado." };
}

/**
 * Validates the file on the server (real type from its bytes, size, dimensions),
 * stores it on the media disk and records it. If recording fails, the stored file is removed.
 */
export async function uploadProductImageAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  if (!hasMediaStorage()) return { error: "La carga de imágenes no está configurada en este entorno." };
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

/** Defines or changes the options (Talle: S, M, L…): one variant per combination. */
export async function configureOptionsAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const parsed = parseOptionDefinitions(values);
  if (!parsed.ok) return { fields: parsed.errors as Record<string, string>, values };
  try {
    await getVariantRepository().configureOptions(admin, values.productId ?? "", parsed.value);
  } catch (error) {
    return dataError(error, values);
  }
  catalogChanged(`/admin/productos/${values.productId}`);
  return { ok: "Variantes actualizadas.", values };
}

/** Price and visibility of one variant. */
export async function updateVariantAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const priceMinor = values.price ? parsePesos(values.price) : null;
  if (values.price && priceMinor === null) return { fields: { price: "Precio en pesos, ej.: 18500." }, values };
  try {
    await getVariantRepository().updateVariant(admin, values.productId ?? "", values.variantId ?? "", {
      priceMinor,
      active: values.active === "on",
    });
  } catch (error) {
    return dataError(error, values);
  }
  catalogChanged(`/admin/productos/${values.productId}`);
  return { ok: "Guardado.", values };
}

/** Copies a product as a draft and opens the copy. */
export async function duplicateProductAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const copy = await getAdminRepository().duplicateProduct(admin, String(form.get("productId") ?? ""));
  catalogChanged("/admin/productos");
  redirect(`/admin/productos/${copy.id}?copia=1`);
}
