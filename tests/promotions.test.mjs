// Promotions engine: stacking rules, every kind, coupons and the database limits.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { applyPromotions, normalizeCoupon, transferPercent } from "../src/lib/promotions.ts";

const now = new Date("2026-11-10T12:00:00-03:00");
const promo = (over) => ({
  id: over.id ?? over.name,
  name: over.name ?? "Promo",
  kind: "percent",
  scope: "all",
  categoryIds: [],
  productIds: [],
  params: {},
  couponCode: null,
  minSubtotalMinor: 0,
  startsAt: null,
  endsAt: null,
  maxUses: null,
  usesCount: 0,
  active: true,
  ...over,
});
const line = (key, unitPriceMinor, quantity, categoryId = "stickers", productId = key) => ({ key, productId, categoryId, unitPriceMinor, quantity });

describe("applyPromotions", () => {
  it("quantity tiers: 4–9 −10 %, 10+ −15 %, counting units across lines in scope", () => {
    const tiers = promo({ name: "Planchas", kind: "quantity_tiers", params: { tiers: [{ minQuantity: 4, percent: 10 }, { minQuantity: 10, percent: 15 }] } });
    const few = applyPromotions({ lines: [line("a", 1_000_000, 3)], promotions: [tiers], now });
    assert.equal(few.discountMinor, 0);
    const mid = applyPromotions({ lines: [line("a", 1_000_000, 2), line("b", 1_000_000, 3)], promotions: [tiers], now });
    assert.equal(mid.discountMinor, 500_000);
    const many = applyPromotions({ lines: [line("a", 1_000_000, 10)], promotions: [tiers], now });
    assert.equal(many.discountMinor, 1_500_000);
  });

  it("3x2 gives the cheapest units free; a combo gets its special price", () => {
    const threeForTwo = promo({ name: "3x2", kind: "buy_x_pay_y", params: { buy: 3, pay: 2 } });
    const result = applyPromotions({ lines: [line("a", 300_000, 2), line("b", 100_000, 2)], promotions: [threeForTwo], now });
    assert.equal(result.discountMinor, 100_000, "4 units → one free, the cheapest");

    const combo = promo({ name: "Combo", kind: "bundle", params: { items: [{ productId: "taza", quantity: 1 }, { productId: "remera", quantity: 1 }], priceMinor: 2_000_000 } });
    const bundled = applyPromotions({ lines: [line("taza", 900_000, 2), line("remera", 1_500_000, 1)], promotions: [combo], now });
    assert.equal(bundled.discountMinor, 400_000, "one combo: 24.000 → 20.000; the second mug at full price");
    assert.equal(bundled.lineDiscounts.taza + bundled.lineDiscounts.remera, 400_000);
  });

  it("each line takes only the best automatic promotion", () => {
    const ten = promo({ name: "10", params: { percent: 10 } });
    const stickers = promo({ name: "Stickers 20", scope: "categories", categoryIds: ["stickers"], params: { percent: 20 } });
    const result = applyPromotions({ lines: [line("a", 100_000, 1), line("b", 100_000, 1, "tazas")], promotions: [ten, stickers], now });
    assert.equal(result.discountMinor, 30_000, "20 % on the sticker, 10 % on the mug, never both");
    assert.deepEqual(result.applied.map((a) => a.name).sort(), ["10", "Stickers 20"]);
  });

  it("a coupon stacks once on what is left, then the transfer discount", () => {
    const auto = promo({ name: "Auto", params: { percent: 10 } });
    const coupon = promo({ name: "Cupón", kind: "fixed", couponCode: "HOLA-500", params: { amountMinor: 50_000 } });
    const transfer = promo({ name: "Transferencia", kind: "payment_method", params: { method: "transfer", percent: 10 } });
    const result = applyPromotions({ lines: [line("a", 1_000_000, 1)], promotions: [auto, coupon, transfer], couponCode: " hola-500 ", paymentPreference: "transfer", now });
    // 10.000 − 1.000 = 9.000 − 500 = 8.500 − 850 = 7.650
    assert.equal(result.discountMinor, 235_000);
    assert.equal(result.coupon.status, "applied");
    assert.equal(transferPercent([auto, coupon, transfer], now), 10);
    const anyPayment = applyPromotions({ lines: [line("a", 1_000_000, 1)], promotions: [transfer], now });
    assert.equal(anyPayment.discountMinor, 0);
  });

  it("explains why a coupon does not apply", () => {
    const lines = [line("a", 100_000, 1)];
    const base = { kind: "percent", params: { percent: 10 } };
    const status = (p, code = "CODE") => applyPromotions({ lines, promotions: [promo({ ...base, couponCode: "CODE", ...p })], couponCode: code, now }).coupon.status;
    assert.equal(status({}, "OTRO"), "invalid");
    assert.equal(status({ active: false }), "invalid");
    assert.equal(status({ endsAt: new Date("2026-11-01T00:00:00-03:00") }), "expired");
    assert.equal(status({ maxUses: 5, usesCount: 5 }), "exhausted");
    assert.equal(status({ minSubtotalMinor: 500_000 }), "min_subtotal");
    assert.equal(status({ scope: "products", productIds: ["zzz"] }), "not_applicable");
    assert.equal(status({}), "applied");
    assert.equal(normalizeCoupon(" ve ra no "), "VERANO");
  });

  it("free shipping, minimum subtotal and dates for automatic promotions", () => {
    const shipping = promo({ name: "Envío", kind: "free_shipping", minSubtotalMinor: 5_000_000 });
    assert.equal(applyPromotions({ lines: [line("a", 1_000_000, 4)], promotions: [shipping], now }).freeShipping, false);
    assert.equal(applyPromotions({ lines: [line("a", 1_000_000, 5)], promotions: [shipping], now }).freeShipping, true);
    const future = promo({ params: { percent: 50 }, startsAt: new Date("2026-12-01T00:00:00-03:00") });
    assert.equal(applyPromotions({ lines: [line("a", 100_000, 1)], promotions: [future], now }).discountMinor, 0);
  });

  it("never discounts more than the subtotal", () => {
    const big = promo({ name: "Grande", kind: "fixed", params: { amountMinor: 9_999_999 } });
    const half = promo({ name: "Mitad", params: { percent: 50 } });
    const result = applyPromotions({ lines: [line("a", 100_000, 1)], promotions: [big, half], now });
    assert.equal(result.discountMinor, 100_000);
  });
});

describe("promotions schema (PGlite)", () => {
  let db;
  before(async () => {
    db = new PGlite();
    const files = readdirSync(join("db", "migrations")).filter((n) => n.endsWith(".sql")).sort();
    for (const name of files) await db.exec(readFileSync(join("db", "migrations", name), "utf8"));
  });
  after(() => db.close());

  it("enforces the coupon format, unique codes and the use limit", async () => {
    await db.query("INSERT INTO promotions (name, kind, coupon_code, max_uses) VALUES ('A', 'percent', 'VERANO-10', 1)");
    await assert.rejects(db.query("INSERT INTO promotions (name, kind, coupon_code) VALUES ('B', 'percent', 'VERANO-10')"));
    await assert.rejects(db.query("INSERT INTO promotions (name, kind, coupon_code) VALUES ('C', 'percent', 'minúsculas')"));
    await db.query("UPDATE promotions SET uses_count = uses_count + 1 WHERE coupon_code = 'VERANO-10'");
    await assert.rejects(db.query("UPDATE promotions SET uses_count = uses_count + 1 WHERE coupon_code = 'VERANO-10'"));
  });
});

describe("checkout with promotions (PGlite)", async () => {
  const { createPostgresCatalogRepository } = await import("../src/server/catalog/postgres-repository.ts");
  const { createPostgresInventoryRepository } = await import("../src/server/inventory/postgres-repository.ts");
  const { checkout } = await import("../src/server/orders/checkout.ts");
  const { createOrderRepository } = await import("../src/server/orders/repository.ts");
  const { createShippingRepository } = await import("../src/server/shipping/repository.ts");
  const { createPromotionRepository, parsePromotion } = await import("../src/server/promotions/repository.ts");

  let db;
  let deps;
  let promos;
  let n = 0;
  const actor = { authUserId: "admin-1", email: "admin@example.com" };
  const contact = { contactName: "Ana", contactEmail: "ana@example.com", contactPhone: "", delivery: { method: "pickup" }, notes: "" };
  const order = (extra) => checkout({ ...contact, idempotencyKey: `promo-test-${++n}-key`, lines: [{ productId: "p08", quantity: 3 }], couponCode: "", paymentPreference: "any", ...extra }, null, deps);

  before(async () => {
    db = new PGlite();
    const files = (folder) => readdirSync(join("db", folder)).filter((name) => name.endsWith(".sql")).sort().map((name) => readFileSync(join("db", folder, name), "utf8"));
    for (const text of [...files("migrations"), ...files("seed")]) await db.exec(text);
    await db.exec("UPDATE inventory SET on_hand = 50, reserved = 0 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku = 'SUB-P08'");
    const query = { query: async (text, params) => (await db.query(text, params)).rows };
    promos = createPromotionRepository(query);
    deps = {
      catalog: createPostgresCatalogRepository(query),
      inventory: createPostgresInventoryRepository(query),
      orders: createOrderRepository(query),
      shipping: createShippingRepository(query),
      promotions: promos,
    };
  });
  after(() => db.close());

  it("freezes the discount, the coupon and counts its use; an exhausted coupon is refused", async () => {
    const parsed = parsePromotion({ name: "Bienvenida", kind: "percent", percent: "10", couponCode: "hola", maxUses: "1", active: "on" });
    assert.equal(parsed.ok, true);
    const id = await promos.save(actor, null, parsed.value);
    const transfer = parsePromotion({ name: "Transferencia", kind: "payment_method", percent: "10", active: "on" });
    await promos.save(actor, null, transfer.value);

    const first = await order({ couponCode: "HOLA", paymentPreference: "transfer" });
    assert.equal(first.ok, true);
    // 3 × 8.900 = 26.700 → −2.670 (cupón) → 24.030 → −2.403 (transferencia)
    assert.equal(first.order.discountMinor, 267_000 + 240_300);
    assert.equal(first.order.couponCode, "HOLA");
    assert.equal(first.order.paymentPreference, "transfer");
    assert.equal(first.order.promotions.length, 2);
    assert.equal((await promos.get(id)).usesCount, 1);

    const second = await order({ couponCode: "HOLA" });
    assert.deepEqual([second.ok, second.reason], [false, "coupon"]);

    // The order expires unpaid: the coupon use comes back.
    await db.query("UPDATE stock_reservations SET expires_at = now() - interval '1 minute' WHERE order_id = $1", [first.order.id]);
    await deps.orders.releaseExpired();
    assert.equal((await promos.get(id)).usesCount, 0);
    const third = await order({ couponCode: "HOLA" });
    assert.equal(third.ok, true);
    assert.equal(third.order.discountMinor, 267_000);
  });

  it("validates the admin form per kind", () => {
    const tiers = parsePromotion({ name: "Planchas", kind: "quantity_tiers", tierMin1: "10", tierPercent1: "15", tierMin2: "4", tierPercent2: "10", active: "on" });
    assert.deepEqual(tiers.value.params.tiers, [{ minQuantity: 4, percent: 10 }, { minQuantity: 10, percent: 15 }]);
    const bad = parsePromotion({ name: "X", kind: "bundle", bundleProduct1: "taza", bundlePrice: "" });
    assert.deepEqual(Object.keys(bad.errors).sort(), ["bundlePrice", "bundleProduct1", "name"]);
    const pay = parsePromotion({ name: "Pago", kind: "payment_method", percent: "10", couponCode: "NO-VA" });
    assert.ok(pay.errors.couponCode);
  });
});
