"use server";

import { revalidatePath, updateTag } from "next/cache";
import { formValues, requireAdmin, type AdminFormState } from "@/server/admin/guard";
import { getHomeRepository, HOME_TAG } from "@/server/home/session";
import { parseHomeHero } from "@/server/home/settings";

export async function saveHomeHeroAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const parsed = parseHomeHero(values);
  if (!parsed.ok) return { fields: parsed.errors, values };
  await getHomeRepository().saveHero(admin, parsed.value);
  updateTag(HOME_TAG);
  revalidatePath("/admin/portada");
  return { ok: "Portada guardada: ya se ve en la tienda.", values };
}
