"use server";

import { revalidatePath, updateTag } from "next/cache";
import { formValues, requireAdmin, type AdminFormState } from "@/server/admin/guard";
import { parseContact } from "@/server/settings/contact";
import { getContactRepository, getLabPricingRepository, SETTINGS_TAG } from "@/server/settings/session";
import { parseLabPricing } from "@/server/settings/lab-pricing";

export async function saveContactAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const parsed = parseContact(values);
  if (!parsed.ok) return { fields: parsed.errors, values };
  await getContactRepository().save(admin, parsed.value);
  updateTag(SETTINGS_TAG);
  revalidatePath("/admin/ajustes");
  return { ok: parsed.value.whatsapp ? "WhatsApp guardado." : "WhatsApp quitado: no se muestran links.", values };
}

export async function saveLabPricingAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const parsed = parseLabPricing(values);
  if (!parsed.ok) return { fields: parsed.errors, values };
  await getLabPricingRepository().save(admin, parsed.value);
  updateTag(SETTINGS_TAG);
  revalidatePath("/admin/ajustes");
  return { ok: parsed.value.sheetPriceMinor ? "Precios de stickers guardados." : "Sin precio: el editor no muestra estimación.", values };
}
