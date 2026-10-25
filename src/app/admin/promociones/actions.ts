"use server";

import { revalidatePath } from "next/cache";
import { formValues, requireAdmin, type AdminFormState } from "@/server/admin/guard";
import { getPromotionRepository } from "@/server/orders/session";
import { parsePromotion, PromotionError } from "@/server/promotions/repository";

const refresh = () => revalidatePath("/admin/promociones");

export async function savePromotionAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  // Checkboxes: several categories, and "active" only when checked.
  const values: Record<string, string> = {
    ...formValues(form),
    categoryIds: form.getAll("categoryIds").map(String).join(","),
    active: form.get("active") ? "on" : "off",
  };
  const parsed = parsePromotion(values);
  if (!parsed.ok) return { fields: parsed.errors, values };
  try {
    await getPromotionRepository().save(admin, values.promotionId || null, parsed.value);
  } catch (error) {
    if (error instanceof PromotionError) return error.field === "form" ? { error: error.message, values } : { fields: { [error.field]: error.message }, values };
    throw error;
  }
  refresh();
  return values.promotionId ? { ok: "Promoción actualizada.", values } : { ok: "Promoción creada." };
}

export async function togglePromotionAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  await getPromotionRepository().setActive(admin, String(form.get("promotionId") ?? ""), form.get("active") === "true");
  refresh();
}

export async function deletePromotionAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  await getPromotionRepository().remove(admin, String(form.get("promotionId") ?? ""));
  refresh();
}
