"use server";

import { revalidatePath } from "next/cache";
import { formValues, requireAdmin, type AdminFormState } from "@/server/admin/guard";
import { CustomRequestError } from "@/server/custom-requests/repository";
import { getCustomRequestRepository } from "@/server/custom-requests/session";
import { parseQuoteResponse } from "@/server/custom-requests/validation";

export async function sendQuoteAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const values = formValues(form);
  const parsed = parseQuoteResponse(values);
  if (!parsed.ok) return { fields: parsed.errors, values };
  try {
    await getCustomRequestRepository().sendQuote(admin.email, values.requestId ?? "", parsed.value);
  } catch (error) {
    if (error instanceof CustomRequestError) return { error: error.message, values };
    throw error;
  }
  revalidatePath("/admin/encargos");
  revalidatePath(`/admin/encargos/${values.requestId}`);
  return { ok: "Presupuesto enviado: el cliente lo ve en la página de su encargo.", values };
}

const INTENTS = ["produce", "deliver", "cancel"] as const;

export async function requestAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const id = String(form.get("requestId") ?? "");
  const intent = String(form.get("intent") ?? "") as (typeof INTENTS)[number];
  const note = String(form.get("note") ?? "").trim().slice(0, 500);
  if (!INTENTS.includes(intent)) return { error: "Acción desconocida." };
  if (intent === "cancel" && !note) return { fields: { note: "Contá por qué se cancela." } };
  const repo = getCustomRequestRepository();
  try {
    if (intent === "produce") await repo.startProduction(admin.email, id, note);
    else if (intent === "deliver") await repo.markDelivered(admin.email, id, note);
    else await repo.cancel(admin.email, id, note);
  } catch (error) {
    if (error instanceof CustomRequestError) return { error: error.message };
    throw error;
  }
  revalidatePath("/admin/encargos");
  revalidatePath(`/admin/encargos/${id}`);
  return { ok: intent === "produce" ? "Encargo en producción." : intent === "deliver" ? "Encargo entregado." : "Encargo cancelado." };
}
