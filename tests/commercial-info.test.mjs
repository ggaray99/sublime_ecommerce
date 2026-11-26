// Price block on product and design pages: transfer price, installments, free shipping and payment methods.
// formatPrice separates "$" from the amount with a non-breaking space (U+00A0), typed as such in the expected strings.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { transferOffer, transferPercent } from "../src/lib/promotions.ts";
import { commercialLines, freeShippingThreshold, NO_COMMERCIAL_INFO, paymentMethodLines } from "../src/lib/commercial.ts";

const now = new Date("2026-11-10T12:00:00-03:00");
const promo = (over) => ({
  id: over.id ?? over.name,
  name: over.name ?? "Promo",
  kind: "payment_method",
  scope: "all",
  categoryIds: [],
  productIds: [],
  params: { method: "transfer", percent: 10 },
  couponCode: null,
  minSubtotalMinor: 0,
  startsAt: null,
  endsAt: null,
  maxUses: null,
  usesCount: 0,
  active: true,
  ...over,
});

describe("transferOffer", () => {
  it("returns the best transfer percent with its minimum purchase", () => {
    const ten = promo({ name: "10", params: { method: "transfer", percent: 10 } });
    const twenty = promo({ name: "20", params: { method: "transfer", percent: 20 }, minSubtotalMinor: 5_000_000 });
    assert.deepEqual(transferOffer([ten, twenty], now), { percent: 20, minSubtotalMinor: 5_000_000 });
    assert.deepEqual(transferOffer([ten], now), { percent: 10, minSubtotalMinor: 0 });
  });

  it("ignores coupons, inactive, expired, not started, exhausted and other kinds, like transferPercent", () => {
    const ignored = [
      promo({ name: "coupon", couponCode: "TRANSFER", params: { method: "transfer", percent: 30 } }),
      promo({ name: "off", active: false, params: { method: "transfer", percent: 30 } }),
      promo({ name: "expired", endsAt: new Date("2026-11-01T00:00:00-03:00"), params: { method: "transfer", percent: 30 } }),
      promo({ name: "later", startsAt: new Date("2026-12-01T00:00:00-03:00"), params: { method: "transfer", percent: 30 } }),
      promo({ name: "used", maxUses: 5, usesCount: 5, params: { method: "transfer", percent: 30 } }),
      promo({ name: "percent", kind: "percent", params: { percent: 30 } }),
    ];
    assert.equal(transferOffer(ignored, now), null);
    assert.equal(transferPercent(ignored, now), null);
    assert.deepEqual(transferOffer([...ignored, promo({ name: "ok", params: { method: "transfer", percent: 15 } })], now), { percent: 15, minSubtotalMinor: 0 });
  });

  it("leaves transferPercent's output unchanged (it ignores the minimum purchase)", () => {
    const withMin = promo({ name: "20", params: { method: "transfer", percent: 20 }, minSubtotalMinor: 5_000_000 });
    assert.equal(transferPercent([withMin, promo({ name: "10" })], now), 20);
    assert.equal(transferPercent([], now), null);
  });
});

const rule = (over) => ({
  id: over.id ?? over.label,
  scope: "province",
  label: "Zona",
  province: "Mendoza",
  city: null,
  postalFrom: null,
  postalTo: null,
  available: true,
  costMinor: 500_000,
  freeFromMinor: null,
  etaMinDays: 1,
  etaMaxDays: 3,
  active: true,
  ...over,
});

describe("freeShippingThreshold", () => {
  it("uses the default rule when it ships and has a free-from amount", () => {
    const rules = [rule({ label: "Mendoza", freeFromMinor: 5_000_000 }), rule({ label: "Resto", scope: "default", province: null, freeFromMinor: 10_000_000 })];
    assert.deepEqual(freeShippingThreshold(rules), { from: 100_000, byZone: false });
  });

  it("otherwise the lowest free-from amount among the zones, marked by zone", () => {
    const rules = [
      rule({ label: "Mendoza", freeFromMinor: 8_000_000 }),
      rule({ label: "San Juan", province: "San Juan", freeFromMinor: 6_000_000 }),
      rule({ label: "Resto", scope: "default", province: null, freeFromMinor: null }),
    ];
    assert.deepEqual(freeShippingThreshold(rules), { from: 60_000, byZone: true });
  });

  it("ignores rules without coverage and an unavailable default rule", () => {
    const rules = [
      rule({ label: "Sin cobertura", available: false, freeFromMinor: 1_000_000 }),
      rule({ label: "Resto", scope: "default", province: null, available: false, freeFromMinor: 2_000_000 }),
      rule({ label: "Mendoza", freeFromMinor: 9_000_000 }),
    ];
    assert.deepEqual(freeShippingThreshold(rules), { from: 90_000, byZone: true });
  });

  it("is null without any free-from amount", () => {
    assert.equal(freeShippingThreshold([]), null);
    assert.equal(freeShippingThreshold([rule({ label: "Mendoza" }), rule({ label: "Resto", scope: "default", province: null })]), null);
  });
});

const info = (over = {}) => ({ ...NO_COMMERCIAL_INFO, ...over });

describe("commercialLines", () => {
  it("shows nothing without promotions, installments or free shipping", () => {
    assert.deepEqual(commercialLines(36_000, info()), []);
  });

  it("transfer price rounded to pesos, with the discount and its minimum purchase", () => {
    assert.deepEqual(commercialLines(36_000, info({ transfer: { percent: 20, minSubtotal: null } })), [
      "$ 28.800 con transferencia o efectivo",
      "20 % de descuento pagando con transferencia o efectivo",
    ]);
    assert.deepEqual(commercialLines(60_000, info({ transfer: { percent: 15, minSubtotal: 50_000 } })), [
      "$ 51.000 con transferencia o efectivo",
      "15 % de descuento pagando con transferencia o efectivo en compras desde $ 50.000",
    ]);
  });

  it("no discounted price when the product alone is under the promotion's minimum purchase", () => {
    // The checkout would not apply it to this product alone, so only the condition is shown.
    assert.deepEqual(commercialLines(9_999, info({ transfer: { percent: 15, minSubtotal: 50_000 } })), [
      "15 % de descuento pagando con transferencia o efectivo en compras desde $ 50.000",
    ]);
  });

  it("installments only from the minimum amount, rounded to centavos", () => {
    const installments = { count: 3, minAmount: 20_000 };
    assert.deepEqual(commercialLines(45_000, info({ installments })), ["3 cuotas sin interés de $ 15.000"]);
    assert.deepEqual(commercialLines(10_000, info({ installments: { count: 3, minAmount: 0 } })), ["3 cuotas sin interés de $ 3.333,33"]);
    assert.deepEqual(commercialLines(20_000, info({ installments })), ["3 cuotas sin interés de $ 6.666,67"]);
    assert.deepEqual(commercialLines(19_999, info({ installments })), []);
  });

  it("free shipping from an amount, by zone when it depends on the address", () => {
    assert.deepEqual(commercialLines(1_000, info({ freeShipping: { from: 100_000, byZone: false } })), ["Envío gratis superando $ 100.000"]);
    assert.deepEqual(commercialLines(1_000, info({ freeShipping: { from: 60_000, byZone: true } })), ["Envío gratis superando $ 60.000 (según zona)"]);
  });

  it("a product priced on request shows no lines", () => {
    const all = info({ transfer: { percent: 10, minSubtotal: null }, installments: { count: 3, minAmount: 0 }, freeShipping: { from: 1, byZone: false } });
    assert.deepEqual(commercialLines(null, all), []);
  });
});

describe("paymentMethodLines", () => {
  it("always offers transfer or cash; Mercado Pago and installments only when enabled", () => {
    assert.deepEqual(paymentMethodLines(info()), ["Transferencia o efectivo"]);
    assert.deepEqual(
      paymentMethodLines(info({ mercadoPago: true, installments: { count: 6, minAmount: 0 }, transfer: { percent: 10, minSubtotal: null } })),
      [
        "Mercado Pago: tarjetas de crédito y débito, dinero en cuenta",
        "6 cuotas sin interés con tarjeta de crédito",
        "Transferencia o efectivo: 10 % de descuento",
      ],
    );
    assert.deepEqual(paymentMethodLines(info({ installments: { count: 3, minAmount: 20_000 }, transfer: { percent: 15, minSubtotal: 50_000 } })), [
      "3 cuotas sin interés con tarjeta de crédito en compras desde $ 20.000",
      "Transferencia o efectivo: 15 % de descuento en compras desde $ 50.000",
    ]);
  });
});
