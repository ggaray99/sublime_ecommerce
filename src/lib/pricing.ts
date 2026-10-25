/**
 * Sale prices. Shared by the store (display), the cart quote and checkout
 * (charged price), so all three always agree. Amounts in centavos.
 */

export type Sale = {
  /** Percentage off every variant (1–90). */
  percent: number | null;
  /** Fixed sale price (single-variant products). */
  priceMinor: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

export const NO_SALE: Sale = { percent: null, priceMinor: null, startsAt: null, endsAt: null };

export function saleActive(sale: Sale, now = new Date()): boolean {
  if (sale.percent === null && sale.priceMinor === null) return false;
  if (sale.startsAt && now < sale.startsAt) return false;
  if (sale.endsAt && now >= sale.endsAt) return false;
  return true;
}

/**
 * What a variant costs right now. A percentage is rounded to whole pesos; a
 * fixed sale price never goes above the regular one.
 */
export function effectivePriceMinor(regularMinor: number, sale: Sale, now = new Date()): number {
  if (!saleActive(sale, now)) return regularMinor;
  if (sale.priceMinor !== null) return Math.min(regularMinor, sale.priceMinor);
  const discounted = Math.round((regularMinor * (100 - (sale.percent ?? 0))) / 100 / 100) * 100;
  return Math.max(100, Math.min(regularMinor, discounted));
}

/** Database row → Sale. */
export function saleOf(row: {
  sale_percent?: number | null;
  sale_price_minor?: string | number | null;
  sale_starts_at?: string | Date | null;
  sale_ends_at?: string | Date | null;
}): Sale {
  return {
    percent: row.sale_percent ?? null,
    priceMinor: row.sale_price_minor === null || row.sale_price_minor === undefined ? null : Number(row.sale_price_minor),
    startsAt: row.sale_starts_at ? new Date(row.sale_starts_at) : null,
    endsAt: row.sale_ends_at ? new Date(row.sale_ends_at) : null,
  };
}
