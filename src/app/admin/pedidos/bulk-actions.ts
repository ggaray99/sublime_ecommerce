"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/server/admin/guard";
import { fulfillOrders, fulfillResultMessage, parseFulfillInput } from "@/server/orders/bulk-orders";
import { getOrderRepository } from "@/server/orders/session";
import { CATALOG_TAG } from "@/server/storefront";

export type BulkOrdersResult = {
  /** Ready-made toast text and tone. */
  message: string;
  tone: "success" | "info" | "warning" | "critical";
  changed: number;
};

/**
 * "Marcar entregado" on the orders checked on the list. Same permission as the
 * order page's button (any admin); each order goes through the existing
 * markFulfilled transition, which writes its history row.
 */
export async function fulfillOrdersAction(input: { ids: string[] }): Promise<BulkOrdersResult> {
  const admin = await requireAdmin();
  const parsed = parseFulfillInput(input);
  if (!parsed.ok) return { message: parsed.error, tone: "critical", changed: 0 };

  const result = await fulfillOrders(getOrderRepository(), admin.email, parsed.ids);
  if (result.changed.length) {
    // Same revalidation as the order page's actions (actions.ts).
    updateTag(CATALOG_TAG);
    revalidatePath("/admin/pedidos");
    for (const order of result.changed) revalidatePath(`/admin/pedidos/${order.id}`);
  }
  return { ...fulfillResultMessage(result), changed: result.changed.length };
}
