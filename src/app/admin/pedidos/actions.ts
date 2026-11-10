"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin, type AdminFormState } from "@/server/admin/guard";
import { OrderError } from "@/server/orders/repository";
import { getOrderRepository } from "@/server/orders/session";
import { CATALOG_TAG } from "@/server/storefront";

const ACTIONS = ["confirm", "cancel", "ship", "fulfill"] as const;

/** One action for the order buttons; the clicked button says which transition. */
export async function orderAction(_state: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const orderId = String(form.get("orderId") ?? "");
  const intent = String(form.get("intent") ?? "") as (typeof ACTIONS)[number];
  const note = String(form.get("note") ?? "").trim().slice(0, 500);
  if (!ACTIONS.includes(intent)) return { error: "Acción desconocida." };
  if (intent === "cancel" && !note) return { fields: { note: "Contá por qué se cancela." } };

  const orders = getOrderRepository();
  let ok: string;
  try {
    if (intent === "confirm") {
      const status = await orders.confirmPayment(admin.email, orderId, note);
      ok = status === "paid" ? "Pago confirmado: el stock reservado pasó a venta." : "Pago tardío sin stock suficiente: el pedido quedó en revisión.";
    } else if (intent === "ship") {
      const carrier = String(form.get("carrier") ?? "").trim().slice(0, 60);
      const code = String(form.get("trackingCode") ?? "").trim().slice(0, 80);
      const url = String(form.get("trackingUrl") ?? "").trim();
      if (!carrier) return { fields: { carrier: "Indicá la empresa de envío." } };
      if (url && !/^https:\/\/[^\s]{4,300}$/.test(url)) return { fields: { trackingUrl: "Enlace https:// válido o vacío." } };
      await orders.markShipped(admin.email, orderId, { carrier, code, url }, note);
      ok = "Pedido marcado como enviado.";
    } else if (intent === "cancel") {
      await orders.cancelOrder(admin.email, orderId, note);
      ok = "Pedido cancelado; el stock reservado se liberó.";
    } else {
      await orders.markFulfilled(admin.email, orderId, note);
      ok = "Pedido marcado como entregado.";
    }
  } catch (error) {
    if (error instanceof OrderError) return { error: error.message };
    throw error;
  }
  // Cancelling or selling changes the stock the store shows.
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok };
}
