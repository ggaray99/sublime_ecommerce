"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { AdminDataError } from "@/server/admin/repository";
import { getAdminRepository, getCurrentAdmin } from "@/server/admin/session";
import { parseProductUpdate, parseStockCount } from "@/server/admin/validation";

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

function dataError(error: unknown): AdminFormState {
  if (error instanceof AdminDataError) return { error: error.message };
  throw error;
}

export async function updateProductAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const productId = String(form.get("productId") ?? "");
  const values = { price: String(form.get("price") ?? ""), status: String(form.get("status") ?? "") };
  const repo = getAdminRepository();
  try {
    const product = await repo.getProduct(productId);
    const parsed = parseProductUpdate(form, product.requiresQuote);
    if (!parsed.ok) return { fields: { price: parsed.errors.priceMinor, status: parsed.errors.status }, values };
    await repo.updateProduct(admin, productId, parsed.value);
  } catch (error) {
    return dataError(error);
  }
  revalidatePath(`/admin/productos/${productId}`);
  return { ok: "Cambios guardados.", values };
}

export async function countStockAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const productId = String(form.get("productId") ?? "");
  const values = { onHand: String(form.get("onHand") ?? ""), reason: String(form.get("reason") ?? ""), note: String(form.get("note") ?? "") };
  const parsed = parseStockCount(form);
  if (!parsed.ok) return { fields: parsed.errors, values };
  try {
    await getAdminRepository().countStock(admin, productId, parsed.value);
  } catch (error) {
    return { ...dataError(error), values };
  }
  revalidatePath(`/admin/productos/${productId}`);
  return { ok: "Stock actualizado." };
}
