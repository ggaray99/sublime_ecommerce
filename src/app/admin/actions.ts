"use server";

import { revalidatePath, updateTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { AdminDataError } from "@/server/admin/repository";
import { getAdminRepository, getCurrentAdmin } from "@/server/admin/session";
import { parseProductCreate, parseProductUpdate, parseStockCount } from "@/server/admin/validation";
import { CATALOG_TAG } from "@/server/storefront";

export type AdminFormState = {
  error?: string;
  fields?: Record<string, string | undefined>;
  ok?: string;
  values?: Record<string, string>;
};

/**
 * Every mutation re-checks admin_users from the session cookie: the page
 * having rendered the form proves nothing about who submits it.
 */
async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();
  return admin;
}

/** Form fields as a plain object (the shape the validators share with the API). */
const formValues = (form: FormData): Record<string, string> =>
  Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));

function dataError(error: unknown, values?: Record<string, string>): AdminFormState {
  if (error instanceof AdminDataError) return { error: error.message, values };
  throw error;
}

/** The store and the admin lists read the cached catalog: refresh both. */
function catalogChanged(productId?: string) {
  updateTag(CATALOG_TAG);
  revalidatePath("/admin");
  if (productId) revalidatePath(`/admin/productos/${productId}`);
}

export async function createProductAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const parsed = parseProductCreate(values);
  if (!parsed.ok) return { fields: parsed.errors, values };
  let productId: string;
  try {
    productId = (await getAdminRepository().createProduct(admin, parsed.value)).id;
  } catch (error) {
    return dataError(error, values);
  }
  catalogChanged();
  redirect(`/admin/productos/${productId}?creado=1`);
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
  catalogChanged(productId);
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
  catalogChanged(productId);
  return { ok: "Stock actualizado." };
}
