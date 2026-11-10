import { MAX_PRICE_MINOR } from "../admin/validation.ts";

export type PriceRule = { type: "percent"; value: number } | { type: "amount"; value: number };
export type Rounding = "none" | "nearest_100" | "nearest_1000";

const STEP: Record<Rounding, number> = { none: 1, nearest_100: 100, nearest_1000: 1000 };

/**
 * New price in centavos after a bulk rule. Returns null when the result would
 * be zero, negative or above the maximum, so the item is reported, not saved.
 * `nearest_100` rounds to whole pesos and `nearest_1000` to multiples of $10.
 */
export function applyPriceRule(priceMinor: number, rule: PriceRule, rounding: Rounding): number | null {
  const raw = rule.type === "percent" ? priceMinor * (1 + rule.value / 100) : priceMinor + rule.value;
  const step = STEP[rounding];
  const rounded = Math.round(raw / step) * step;
  return rounded > 0 && rounded <= MAX_PRICE_MINOR ? rounded : null;
}
