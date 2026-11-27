"use server";

import { catalogChanged, requireAdmin } from "@/server/admin/guard";
import { changeProducts, MAX_BULK_PRODUCTS } from "@/server/admin/product-changes";
import { bulkProductChange, bulkResultMessage, parseBulkProductInput } from "@/server/admin/product-search";
import { getAdminRepository } from "@/server/admin/session";

export type BulkProductsResult = {
  /** Ready-made toast text and tone. */
  message: string;
  tone: "success" | "info" | "warning" | "critical";
  changed: number;
};

/**
 * Publish, unpublish, archive or (un)feature the products checked on the list.
 * Same permission as saving one product (any admin), and each product goes
 * through changeProducts: the product page's validation and audit entry.
 */
export async function changeProductsAction(input: { action: string; ids: string[] }): Promise<BulkProductsResult> {
  const admin = await requireAdmin();
  const parsed = parseBulkProductInput(input, MAX_BULK_PRODUCTS);
  if (!parsed.ok) return { message: parsed.error, tone: "critical", changed: 0 };

  const result = await changeProducts(getAdminRepository(), admin, parsed.ids, bulkProductChange(parsed.action));
  if (result.changed.length) catalogChanged("/admin/productos");
  return { ...bulkResultMessage(parsed.action, result), changed: result.changed.length };
}
