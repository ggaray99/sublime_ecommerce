"use server";

import { revalidatePath, updateTag } from "next/cache";
import { formValues, requireAdmin, type AdminFormState } from "@/server/admin/guard";
import { COMMERCIAL_TAG } from "@/server/commercial";
import { getShippingRepository } from "@/server/orders/session";
import { parsePickup, parseShippingRule, ShippingError } from "@/server/shipping/repository";

/** Forms send checkboxes only when checked. */
const withFlags = (values: Record<string, string>): Record<string, string> => ({
  ...values,
  available: values.available ?? "off",
  active: values.active ?? "off",
});

export async function saveShippingRuleAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = withFlags(formValues(form));
  const parsed = parseShippingRule(values);
  if (!parsed.ok) return { fields: parsed.errors, values };
  try {
    const repo = getShippingRepository();
    if (values.ruleId) await repo.updateRule(admin, values.ruleId, parsed.value);
    else await repo.createRule(admin, parsed.value);
  } catch (error) {
    if (error instanceof ShippingError) return { error: error.message, values };
    throw error;
  }
  // Free shipping from an amount is also shown under the store prices.
  updateTag(COMMERCIAL_TAG);
  revalidatePath("/admin/envios");
  revalidatePath("/checkout");
  return values.ruleId ? { ok: "Regla actualizada.", values } : { ok: "Regla creada." };
}

export async function deleteShippingRuleAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  await getShippingRepository().deleteRule(admin, String(form.get("ruleId") ?? ""));
  // Free shipping from an amount is also shown under the store prices.
  updateTag(COMMERCIAL_TAG);
  revalidatePath("/admin/envios");
  revalidatePath("/checkout");
}

export async function savePickupAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const parsed = parsePickup({ ...values, enabled: values.enabled ?? "off" });
  if (!parsed.ok) return { fields: parsed.errors, values };
  await getShippingRepository().setPickup(admin, parsed.value);
  revalidatePath("/admin/envios");
  revalidatePath("/checkout");
  return { ok: "Punto de retiro guardado.", values };
}
