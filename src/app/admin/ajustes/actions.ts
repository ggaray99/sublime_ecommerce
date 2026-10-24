"use server";

import { revalidatePath, updateTag } from "next/cache";
import { formValues, requireAdmin, type AdminFormState } from "@/server/admin/guard";
import { parseContact } from "@/server/settings/contact";
import { getContactRepository, SETTINGS_TAG } from "@/server/settings/session";

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
