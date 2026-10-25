/**
 * Price estimate for custom sticker sheets, from the price list Sublime uses:
 * one price per 21 × 29 cm sheet and a discount by number of sheets.
 * Edited in /admin/ajustes; the estimate is shown in the editor and saved with
 * the request, and the final quote is still confirmed by the shop.
 */
export type LabPricing = {
  /** Price of one sheet, in centavos. 0 = no estimate shown. */
  sheetPriceMinor: number;
  /** "From N sheets, X % off": the highest tier reached applies. */
  tiers: { minSheets: number; percent: number }[];
};

export const DEFAULT_LAB_PRICING: LabPricing = {
  sheetPriceMinor: 1_000_110,
  tiers: [
    { minSheets: 4, percent: 10 },
    { minSheets: 10, percent: 15 },
  ],
};

export type LabEstimate = { sheets: number; unitMinor: number; percent: number; totalMinor: number };

/** Discounted prices are rounded to whole pesos, like the price list; the base price stays exact. */
export function estimateSheets(pricing: LabPricing, sheets: number): LabEstimate | null {
  if (!pricing.sheetPriceMinor || sheets <= 0) return null;
  const tier = [...pricing.tiers].sort((a, b) => b.minSheets - a.minSheets).find((candidate) => sheets >= candidate.minSheets);
  const percent = tier?.percent ?? 0;
  const unitMinor = percent ? Math.round((pricing.sheetPriceMinor * (100 - percent)) / 100 / 100) * 100 : pricing.sheetPriceMinor;
  return { sheets, unitMinor, percent, totalMinor: unitMinor * sheets };
}
