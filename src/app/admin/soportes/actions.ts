"use server";

import { isMockupKind, MOCKUP_KIND_LABELS } from "@/lib/designs/kinds";
import { catalogChanged, dataError, formValues, requireAdmin, type AdminFormState } from "@/server/admin/guard";
import { getDesignRepository } from "@/server/admin/session";

/** Links a product to a base kind (Remera, Taza…), or unlinks it with an empty value. */
export async function saveMockupBaseAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const kind = values.kind;
  if (!isMockupKind(kind)) return { error: "Ese tipo de soporte no existe.", values };
  // The admin lists products by their catalog id (legacy_id); the repository resolves it.
  const productId = (values.productId ?? "").trim() || null;
  try {
    await getDesignRepository().setMockupBase(admin, kind, productId);
  } catch (error) {
    return dataError(error, values);
  }
  catalogChanged("/admin/soportes", "/disenos");
  return { ok: productId ? `${MOCKUP_KIND_LABELS[kind]}: producto base guardado.` : `${MOCKUP_KIND_LABELS[kind]}: sin producto base.`, values };
}
