import { cacheLife, cacheTag } from "next/cache";
import { freeShippingThreshold, NO_COMMERCIAL_INFO, type CommercialInfo } from "../lib/commercial.ts";
import { transferOffer } from "../lib/promotions.ts";
import { hasDatabase } from "./db/client.ts";
import { getPromotionRepository, getShippingRepository } from "./orders/session.ts";
import { onlinePaymentsAvailable } from "./payments/session.ts";
import { getInstallmentsSettings } from "./settings/session.ts";

/**
 * Invalidated with updateTag() by the promotions, shipping, installments and
 * Mercado Pago admin actions (revalidateTag from the Mercado Pago callback route).
 */
export const COMMERCIAL_TAG = "commercial";

/**
 * Transfer discount, free shipping, installments and payment methods shown
 * under the prices of product and design pages, already in pesos. Without a
 * database (demo) there is none of it.
 *
 * Cached for minutes: a promotion that ends on a date stops showing here
 * within a few minutes; the checkout always uses the live promotions.
 */
export async function getCommercialInfo(): Promise<CommercialInfo> {
  "use cache";
  cacheTag(COMMERCIAL_TAG);
  if (!hasDatabase()) {
    cacheLife("max");
    return NO_COMMERCIAL_INFO;
  }
  cacheLife("minutes");
  const [promotions, rules, installments, mercadoPago] = await Promise.all([
    getPromotionRepository().listActive(),
    getShippingRepository().listRules({ activeOnly: true }),
    getInstallmentsSettings(),
    onlinePaymentsAvailable(),
  ]);
  const transfer = transferOffer(promotions);
  return {
    transfer: transfer && { percent: transfer.percent, minSubtotal: transfer.minSubtotalMinor ? transfer.minSubtotalMinor / 100 : null },
    freeShipping: freeShippingThreshold(rules),
    installments: installments.enabled ? { count: installments.count, minAmount: installments.minAmount } : null,
    mercadoPago,
  };
}
