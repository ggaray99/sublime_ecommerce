"use server";

import { isMockupKind, MOCKUP_KIND_LABELS } from "@/lib/designs/kinds";
import { catalogChanged, dataError, formValues, requireAdmin, type AdminFormState } from "@/server/admin/guard";
import { getSql } from "@/server/db/client";
import { createSizeGuideRepository, parseSizeGuide } from "@/server/designs/size-guides";

const UNKNOWN_KIND = "Ese tipo de soporte no existe.";

function sizeGuideChanged() {
  catalogChanged("/admin/soportes", "/disenos");
}

/** Creates or replaces the size-guide table of one kind. */
export async function saveSizeGuideAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const kind = values.kind;
  if (!isMockupKind(kind)) return { error: UNKNOWN_KIND, values };
  const parsed = parseSizeGuide(values);
  if ("error" in parsed) return { error: parsed.error, values };
  try {
    await createSizeGuideRepository(getSql()).saveSizeGuide(admin, kind, parsed.guide);
  } catch (error) {
    return dataError(error, values);
  }
  sizeGuideChanged();
  return { ok: `${MOCKUP_KIND_LABELS[kind]}: guía de talles guardada. La tienda ya la muestra.` };
}

/** Removes the kind's size guide: the store stops showing it. */
export async function deleteSizeGuideAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const kind = String(form.get("kind") ?? "");
  if (!isMockupKind(kind)) return { error: UNKNOWN_KIND };
  try {
    await createSizeGuideRepository(getSql()).deleteSizeGuide(admin, kind);
  } catch (error) {
    return dataError(error);
  }
  sizeGuideChanged();
  return { ok: `${MOCKUP_KIND_LABELS[kind]}: guía de talles quitada.` };
}
