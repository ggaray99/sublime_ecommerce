"use server";

import { revalidatePath, updateTag } from "next/cache";
import { formValues, requireAdmin, type AdminFormState } from "@/server/admin/guard";
import { parsePoint, PointError } from "@/server/points/repository";
import { getPointRepository, POINTS_TAG } from "@/server/points/session";

/** The public map and the admin list both read points: refresh both. */
function pointsChanged() {
  updateTag(POINTS_TAG);
  revalidatePath("/admin/puntos");
}

export async function savePointAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  // Checkboxes are only sent when checked.
  const values: Record<string, string> = { ...formValues(form), active: form.get("active") ? "on" : "off" };
  const parsed = parsePoint(values);
  if (!parsed.ok) return { fields: parsed.errors, values };
  const repo = getPointRepository();
  try {
    if (values.pointId) await repo.update(admin, values.pointId, parsed.value);
    else await repo.create(admin, parsed.value);
  } catch (error) {
    if (error instanceof PointError) return { error: error.message, values };
    throw error;
  }
  pointsChanged();
  return values.pointId ? { ok: "Punto de venta actualizado.", values } : { ok: "Punto de venta creado." };
}

export async function deletePointAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  await getPointRepository().remove(admin, String(form.get("pointId") ?? ""));
  pointsChanged();
}
