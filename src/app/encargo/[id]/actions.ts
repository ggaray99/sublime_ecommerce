"use server";

import { revalidatePath } from "next/cache";
import { CustomRequestError } from "@/server/custom-requests/repository";
import { getCustomRequestRepository } from "@/server/custom-requests/session";
import { getCurrentCustomer } from "@/server/customers/session";

export type DecisionState = { error?: string; ok?: string };

/**
 * The customer accepts or declines a quote. Allowed with the private link's
 * token or as the signed-in customer who made the request.
 */
export async function decideQuoteAction(_state: DecisionState, form: FormData): Promise<DecisionState> {
  const id = String(form.get("requestId") ?? "");
  const token = String(form.get("t") ?? "");
  const decision = String(form.get("decision") ?? "");
  const note = String(form.get("note") ?? "").trim().slice(0, 500);
  if (decision !== "accept" && decision !== "decline") return { error: "Elegí aceptar o rechazar." };

  const repo = getCustomRequestRepository();
  let request = await repo.getByToken(id, token);
  if (!request) {
    const customer = await getCurrentCustomer().catch(() => null);
    const candidate = customer ? await repo.get(id).catch(() => null) : null;
    request = candidate && customer && candidate.customerId === customer.id ? candidate : null;
  }
  if (!request) return { error: "No encontramos el encargo." };

  try {
    await repo.decide(request.id, decision, `cliente:${request.contactEmail}`, note);
  } catch (error) {
    if (error instanceof CustomRequestError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/encargo/${request.id}`);
  return { ok: decision === "accept" ? "¡Gracias! Aceptaste el presupuesto. Te contactamos para coordinar la seña y el diseño." : "Listo, registramos que no seguís con este presupuesto." };
}
