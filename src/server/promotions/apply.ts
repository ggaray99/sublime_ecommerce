import { applyPromotions, type PaymentPreference, type Promotion, type PromotionResult } from "../../lib/promotions.ts";
import type { CartQuote } from "../cart/quote.ts";

/** Runs the promotions engine over a server quote (prices already include product sales). */
export function discountQuote(
  quote: Pick<CartQuote, "lines">,
  promotions: Promotion[],
  options: { couponCode?: string; paymentPreference?: PaymentPreference; now?: Date } = {},
): PromotionResult {
  return applyPromotions({
    lines: quote.lines.map((line) => ({
      key: line.sku,
      productId: line.productId,
      categoryId: line.categoryId,
      unitPriceMinor: line.unitPriceMinor,
      quantity: line.quantity,
    })),
    promotions,
    ...options,
  });
}
