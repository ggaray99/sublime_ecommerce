/**
 * Promotions engine. Pure: the cart quote and checkout call it with the lines
 * the server already priced (sale prices included) and the active promotions.
 *
 * Rules, in order:
 *  1. Automatic line promotions (percent, quantity tiers, buy X pay Y, bundle):
 *     each line gets at most one, the one that saves the most (chosen greedily).
 *  2. The best automatic fixed amount off the order, if any.
 *  3. One coupon, on what is left after the automatic discounts.
 *  4. Payment-method discount (e.g. transfer or cash), on what is left.
 *  Free shipping comes from an automatic promotion or the coupon.
 *  The total discount never exceeds the subtotal. Amounts in centavos.
 */

export const PROMOTION_KINDS = {
  percent: "Porcentaje de descuento",
  fixed: "Monto fijo de descuento",
  quantity_tiers: "Descuento por cantidad",
  buy_x_pay_y: "Llevá X, pagá Y",
  free_shipping: "Envío gratis",
  bundle: "Combo a precio especial",
  payment_method: "Descuento por medio de pago",
} as const;

export type PromotionKind = keyof typeof PROMOTION_KINDS;
export type PromotionScope = "all" | "categories" | "products";
export type PaymentPreference = "any" | "transfer";

export type PromotionParams = {
  percent?: number;
  amountMinor?: number;
  tiers?: { minQuantity: number; percent: number }[];
  buy?: number;
  pay?: number;
  items?: { productId: string; quantity: number }[];
  priceMinor?: number;
  method?: "transfer";
};

export type Promotion = {
  id: string;
  name: string;
  kind: PromotionKind;
  scope: PromotionScope;
  categoryIds: string[];
  productIds: string[];
  params: PromotionParams;
  couponCode: string | null;
  minSubtotalMinor: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  usesCount: number;
  active: boolean;
};

export type PromoLine = { key: string; productId: string; categoryId: string; unitPriceMinor: number; quantity: number };

export type AppliedPromotion = { promotionId: string; name: string; kind: PromotionKind; amountMinor: number; coupon: string | null; freeShipping?: boolean };

export type CouponStatus =
  | { code: string; status: "applied"; message: string }
  | { code: string; status: "invalid" | "expired" | "exhausted" | "min_subtotal" | "not_applicable"; message: string };

export type PromotionResult = {
  subtotalMinor: number;
  discountMinor: number;
  applied: AppliedPromotion[];
  freeShipping: boolean;
  coupon: CouponStatus | null;
  /** Discount per line key, for the order breakdown. */
  lineDiscounts: Record<string, number>;
};

export const normalizeCoupon = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");

const pesos = (minor: number) => `$ ${(minor / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

export function promotionLive(promotion: Promotion, now: Date): boolean {
  if (!promotion.active) return false;
  if (promotion.startsAt && now < promotion.startsAt) return false;
  if (promotion.endsAt && now >= promotion.endsAt) return false;
  if (promotion.maxUses !== null && promotion.usesCount >= promotion.maxUses) return false;
  return true;
}

function inScope(promotion: Promotion, line: PromoLine): boolean {
  if (promotion.kind === "bundle") return (promotion.params.items ?? []).some((item) => item.productId === line.productId);
  if (promotion.scope === "categories") return promotion.categoryIds.includes(line.categoryId);
  if (promotion.scope === "products") return promotion.productIds.includes(line.productId);
  return true;
}

/** Amount still payable on each line after earlier discounts. */
type Remaining = Map<string, number>;
const lineTotal = (line: PromoLine) => line.unitPriceMinor * line.quantity;

/** Per-line discounts a promotion gives on the given lines (empty when it does not apply). */
function lineDiscountsOf(promotion: Promotion, lines: PromoLine[], remaining: Remaining): Map<string, number> {
  const eligible = lines.filter((line) => inScope(promotion, line) && (remaining.get(line.key) ?? 0) > 0);
  const out = new Map<string, number>();
  const pct = (line: PromoLine, percent: number) => Math.round(((remaining.get(line.key) ?? 0) * percent) / 100);
  const { params } = promotion;

  if (promotion.kind === "percent" && params.percent) {
    for (const line of eligible) out.set(line.key, pct(line, params.percent));
  } else if (promotion.kind === "quantity_tiers" && params.tiers?.length) {
    const units = eligible.reduce((sum, line) => sum + line.quantity, 0);
    const tier = [...params.tiers].sort((a, b) => b.minQuantity - a.minQuantity).find((t) => units >= t.minQuantity);
    if (tier) for (const line of eligible) out.set(line.key, pct(line, tier.percent));
  } else if (promotion.kind === "buy_x_pay_y" && params.buy && params.pay !== undefined && params.buy > params.pay) {
    // Every group of `buy` units: the (buy − pay) cheapest units are free.
    const units = eligible.flatMap((line) => Array.from({ length: line.quantity }, () => ({ key: line.key, price: line.unitPriceMinor })));
    units.sort((a, b) => b.price - a.price);
    const free = Math.floor(units.length / params.buy) * (params.buy - params.pay);
    for (const unit of units.slice(units.length - free)) out.set(unit.key, (out.get(unit.key) ?? 0) + unit.price);
  } else if (promotion.kind === "bundle" && params.items?.length && params.priceMinor !== undefined) {
    const byProduct = new Map(eligible.map((line) => [line.productId, line]));
    const times = Math.min(...params.items.map((item) => Math.floor((byProduct.get(item.productId)?.quantity ?? 0) / item.quantity)));
    if (times > 0 && Number.isFinite(times)) {
      const regular = params.items.reduce((sum, item) => sum + item.quantity * byProduct.get(item.productId)!.unitPriceMinor, 0);
      const saving = times * (regular - params.priceMinor);
      if (saving > 0) {
        // Split the saving across the bundle lines in proportion to their price.
        let given = 0;
        params.items.forEach((item, index) => {
          const line = byProduct.get(item.productId)!;
          const share = index === params.items!.length - 1 ? saving - given : Math.round((saving * item.quantity * line.unitPriceMinor) / regular);
          given += share;
          out.set(line.key, (out.get(line.key) ?? 0) + share);
        });
      }
    }
  }
  // Never more than what is left on a line.
  for (const [key, amount] of out) out.set(key, Math.max(0, Math.min(amount, remaining.get(key) ?? 0)));
  for (const [key, amount] of out) if (!amount) out.delete(key);
  return out;
}

const sum = (map: Map<string, number>) => [...map.values()].reduce((a, b) => a + b, 0);

export function applyPromotions(input: {
  lines: PromoLine[];
  promotions: Promotion[];
  couponCode?: string;
  paymentPreference?: PaymentPreference;
  now?: Date;
}): PromotionResult {
  const now = input.now ?? new Date();
  const subtotalMinor = input.lines.reduce((total, line) => total + lineTotal(line), 0);
  const remaining: Remaining = new Map(input.lines.map((line) => [line.key, lineTotal(line)]));
  const applied: AppliedPromotion[] = [];
  const lineDiscounts: Record<string, number> = {};
  let orderDiscount = 0;
  let freeShipping = false;

  const take = (promotion: Promotion, perLine: Map<string, number>, coupon: string | null) => {
    for (const [key, amount] of perLine) {
      remaining.set(key, (remaining.get(key) ?? 0) - amount);
      lineDiscounts[key] = (lineDiscounts[key] ?? 0) + amount;
    }
    applied.push({ promotionId: promotion.id, name: promotion.name, kind: promotion.kind, amountMinor: sum(perLine), coupon });
  };
  const remainingTotal = () => [...remaining.values()].reduce((a, b) => a + b, 0) - orderDiscount;

  const live = input.promotions.filter((p) => promotionLive(p, now) && subtotalMinor >= p.minSubtotalMinor);
  const automatic = live.filter((p) => !p.couponCode);

  // 1. Automatic line promotions: greedy, each line claimed by one promotion.
  const lineKinds: PromotionKind[] = ["percent", "quantity_tiers", "buy_x_pay_y", "bundle"];
  const pending = automatic.filter((p) => lineKinds.includes(p.kind));
  const claimed = new Set<string>();
  for (;;) {
    const free = input.lines.filter((line) => !claimed.has(line.key));
    // Each promotion competes only on the lines where it beats the others, so a
    // store-wide 10 % does not take a line a category 20 % would discount more.
    const raw = pending.map((promotion) => lineDiscountsOf(promotion, free, remaining));
    const topPerLine = new Map<string, number>();
    for (const perLine of raw) for (const [key, amount] of perLine) topPerLine.set(key, Math.max(topPerLine.get(key) ?? 0, amount));
    let best: { promotion: Promotion; perLine: Map<string, number>; total: number } | null = null;
    const consider = (promotion: Promotion, perLine: Map<string, number>) => {
      const total = sum(perLine);
      if (total > 0 && (!best || total > best.total)) best = { promotion, perLine, total };
    };
    pending.forEach((promotion, index) => {
      const own = free.filter((line) => (raw[index].get(line.key) ?? 0) >= (topPerLine.get(line.key) ?? 0) && raw[index].has(line.key));
      consider(promotion, lineDiscountsOf(promotion, own, remaining));
    });
    if (!best) pending.forEach((promotion, index) => consider(promotion, raw[index]));
    // Assigned inside callbacks, so TypeScript cannot narrow it here.
    const chosen = best as { promotion: Promotion; perLine: Map<string, number> } | null;
    if (!chosen) break;
    take(chosen.promotion, chosen.perLine, null);
    for (const key of chosen.perLine.keys()) claimed.add(key);
    pending.splice(pending.indexOf(chosen.promotion), 1);
  }

  // 2. Best automatic fixed amount off the order.
  const fixed = automatic
    .filter((p) => p.kind === "fixed" && p.params.amountMinor)
    .map((p) => ({ promotion: p, amount: Math.min(p.params.amountMinor!, eligibleRemaining(p)) }))
    .sort((a, b) => b.amount - a.amount)[0];
  if (fixed && fixed.amount > 0) {
    orderDiscount += fixed.amount;
    applied.push({ promotionId: fixed.promotion.id, name: fixed.promotion.name, kind: "fixed", amountMinor: fixed.amount, coupon: null });
  }
  function eligibleRemaining(promotion: Promotion) {
    return input.lines.filter((line) => inScope(promotion, line)).reduce((total, line) => total + (remaining.get(line.key) ?? 0), 0) - orderDiscount;
  }

  const automaticShipping = automatic.find((p) => p.kind === "free_shipping");
  if (automaticShipping) {
    freeShipping = true;
    applied.push({ promotionId: automaticShipping.id, name: automaticShipping.name, kind: "free_shipping", amountMinor: 0, coupon: null, freeShipping: true });
  }

  // 3. Coupon.
  let coupon: CouponStatus | null = null;
  const code = input.couponCode ? normalizeCoupon(input.couponCode) : "";
  if (code) {
    const promotion = input.promotions.find((p) => p.couponCode === code);
    if (!promotion || !promotion.active) coupon = { code, status: "invalid", message: "Ese cupón no existe." };
    else if ((promotion.startsAt && now < promotion.startsAt) || (promotion.endsAt && now >= promotion.endsAt)) {
      coupon = { code, status: "expired", message: "Ese cupón no está vigente." };
    } else if (promotion.maxUses !== null && promotion.usesCount >= promotion.maxUses) {
      coupon = { code, status: "exhausted", message: "Ese cupón ya se usó todas las veces posibles." };
    } else if (subtotalMinor < promotion.minSubtotalMinor) {
      coupon = { code, status: "min_subtotal", message: `El cupón vale para compras desde ${pesos(promotion.minSubtotalMinor)}.` };
    } else if (promotion.kind === "free_shipping") {
      freeShipping = true;
      applied.push({ promotionId: promotion.id, name: promotion.name, kind: "free_shipping", amountMinor: 0, coupon: code, freeShipping: true });
      coupon = { code, status: "applied", message: "Cupón aplicado: envío gratis." };
    } else if (promotion.kind === "fixed") {
      const amount = Math.min(promotion.params.amountMinor ?? 0, eligibleRemaining(promotion));
      if (amount > 0) {
        orderDiscount += amount;
        applied.push({ promotionId: promotion.id, name: promotion.name, kind: "fixed", amountMinor: amount, coupon: code });
        coupon = { code, status: "applied", message: `Cupón aplicado: −${pesos(amount)}.` };
      } else coupon = { code, status: "not_applicable", message: "El cupón no aplica a los productos del carrito." };
    } else if (promotion.kind === "payment_method") {
      coupon = { code, status: "not_applicable", message: "Ese cupón se aplica al elegir el medio de pago." };
    } else {
      const perLine = lineDiscountsOf(promotion, input.lines, remaining);
      if (sum(perLine) > 0) {
        take(promotion, perLine, code);
        coupon = { code, status: "applied", message: `Cupón aplicado: −${pesos(sum(perLine))}.` };
      } else coupon = { code, status: "not_applicable", message: "El cupón no aplica a los productos del carrito." };
    }
  }

  // 4. Payment method (automatic), on what is left.
  if (input.paymentPreference === "transfer") {
    const byMethod = automatic.filter((p) => p.kind === "payment_method" && p.params.method === "transfer" && p.params.percent);
    const best = byMethod.sort((a, b) => (b.params.percent ?? 0) - (a.params.percent ?? 0))[0];
    if (best) {
      const amount = Math.round((Math.max(0, remainingTotal()) * best.params.percent!) / 100);
      if (amount > 0) {
        orderDiscount += amount;
        applied.push({ promotionId: best.id, name: best.name, kind: "payment_method", amountMinor: amount, coupon: null });
      }
    }
  }

  const lineTotalDiscount = Object.values(lineDiscounts).reduce((a, b) => a + b, 0);
  const discountMinor = Math.min(subtotalMinor, lineTotalDiscount + orderDiscount);
  return { subtotalMinor, discountMinor, applied, freeShipping, coupon, lineDiscounts };
}

/** The transfer discount on offer (for the checkout choice), or null. */
export function transferPercent(promotions: Promotion[], now = new Date()): number | null {
  const best = promotions
    .filter((p) => !p.couponCode && p.kind === "payment_method" && p.params.method === "transfer" && promotionLive(p, now))
    .sort((a, b) => (b.params.percent ?? 0) - (a.params.percent ?? 0))[0];
  return best?.params.percent ?? null;
}
