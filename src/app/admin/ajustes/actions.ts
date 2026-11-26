"use server";

import { revalidatePath, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { formValues, requireAdmin, type AdminFormState } from "@/server/admin/guard";
import { createPreviewToken, PREVIEW_COOKIE, PREVIEW_DAYS, PREVIEW_FLAG_COOKIE } from "@/server/preview";
import { parseContact } from "@/server/settings/contact";
import { isInfoPageSlug, parsePageContent } from "@/server/settings/pages";
import { COMMERCIAL_TAG } from "@/server/commercial";
import { getContactRepository, getInstallmentsRepository, getLabPricingRepository, getPagesRepository, getStoreStatusRepository, SETTINGS_TAG } from "@/server/settings/session";
import { parseInstallments } from "@/server/settings/installments";
import { parseLabPricing } from "@/server/settings/lab-pricing";
import { forgetStoreStatus } from "@/server/store-status";

/** Opens or closes the store to the public (closed = "Estamos trabajando"). */
export async function setStoreStatusAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const closed = form.get("closed") === "true";
  await getStoreStatusRepository().save(admin, closed);
  forgetStoreStatus();
  // Once open, everyone sees the store: the preview bar would only mislead.
  if (!closed) await clearPreviewCookies();
  revalidatePath("/admin", "layout");
}

/** Lets this admin browse the closed store; everyone else keeps seeing the maintenance page. */
export async function startPreviewAction(): Promise<void> {
  await requireAdmin();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) redirect("/");
  const jar = await cookies();
  const options = { path: "/", sameSite: "lax" as const, secure: (process.env.BETTER_AUTH_URL ?? "").startsWith("https:"), maxAge: PREVIEW_DAYS * 86_400 };
  jar.set(PREVIEW_COOKIE, createPreviewToken(secret), { ...options, httpOnly: true });
  jar.set(PREVIEW_FLAG_COOKIE, "1", options);
  redirect("/");
}

async function clearPreviewCookies() {
  const jar = await cookies();
  jar.delete(PREVIEW_COOKIE);
  jar.delete(PREVIEW_FLAG_COOKIE);
}

export async function saveContactAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const parsed = parseContact(values);
  if (!parsed.ok) return { fields: parsed.errors, values };
  await getContactRepository().save(admin, parsed.value);
  updateTag(SETTINGS_TAG);
  revalidatePath("/admin/ajustes");
  return { ok: "Datos de contacto guardados. Los vacíos no se muestran en la tienda.", values };
}

const PAGE_PATHS = { nosotros: "/nosotros", envios: "/envios", preguntas: "/preguntas", politicas: "/politicas" } as const;

export async function savePageAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const slug = values.slug ?? "";
  if (!isInfoPageSlug(slug)) return { error: "Página desconocida." };
  const parsed = parsePageContent(values);
  if (!parsed.ok) return { fields: parsed.errors, values };
  await getPagesRepository().save(admin, slug, parsed.value);
  updateTag(SETTINGS_TAG);
  revalidatePath(PAGE_PATHS[slug]);
  revalidatePath("/admin/ajustes", "layout");
  return { ok: "Página guardada. Ya se ve en la tienda.", values };
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

export async function saveInstallmentsAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = { ...formValues(form), enabled: form.get("enabled") ? "on" : "off" };
  const parsed = parseInstallments(values);
  if (!parsed.ok) return { fields: parsed.errors, values };
  await getInstallmentsRepository().save(admin, parsed.value);
  updateTag(SETTINGS_TAG);
  updateTag(COMMERCIAL_TAG);
  revalidatePath("/admin/ajustes");
  return { ok: parsed.value.enabled ? "Cuotas guardadas. Ya se muestran debajo de los precios." : "Cuotas desactivadas: la tienda no las muestra.", values };
}
