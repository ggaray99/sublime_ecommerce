// Business rule (docs/admin-orders-rules.md, 1): cancelling an order gives its
// coupon use back, like expiry already does, exactly once and only when the
// order still holds it. Stock reservations move exactly as before.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createOrderRepository } from "../src/server/orders/repository.ts";

const files = (folder) =>
  readdirSync(join("db", folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join("db", folder, name), "utf8"));

describe("coupon use on cancel (PGlite)", () => {
  let db;
  let orders;
  let promotionId;
  let counter = 0;

  before(async () => {
    db = new PGlite();
    for (const sql of [...files("migrations"), ...files("seed")]) await db.exec(sql);
    orders = createOrderRepository({ query: async (text, params) => (await db.query(text, params)).rows });
    const { rows } = await db.query(
      `INSERT INTO promotions (name, kind, params, coupon_code, max_uses) VALUES ('Cupón QA', 'percent', '{"percent": 10}', 'QA10', 1) RETURNING id`,
    );
    promotionId = rows[0].id;
  });
  after(() => db.close());

  beforeEach(async () => {
    await db.exec("UPDATE inventory SET on_hand = 20, reserved = 0 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku = 'SUB-P08'");
    await db.exec("DELETE FROM promotion_redemptions");
    await db.query("UPDATE promotions SET uses_count = 0 WHERE id = $1", [promotionId]);
  });

  const placeWithCoupon = () =>
    orders.placeOrder({
      contactName: "Ana Pérez",
      contactEmail: "ana@example.com",
      contactPhone: "",
      delivery: { method: "pickup" },
      notes: "",
      shipping: { method: "pickup", costMinor: 0, label: "Retiro", ruleId: null, free: false, etaMinDays: null, etaMaxDays: null },
      idempotencyKey: `coupon-release-${++counter}-key`,
      customerId: null,
      lines: [{ sku: "SUB-P08", productId: "p08", name: "Pack", quantity: 1, unitPriceMinor: 890000 }],
      discountMinor: 89000,
      promotions: [{ promotionId, name: "Cupón QA", kind: "percent", amountMinor: 89000, coupon: "QA10" }],
      couponCode: "QA10",
    });

  const uses = async () => (await db.query("SELECT uses_count FROM promotions WHERE id = $1", [promotionId])).rows[0].uses_count;
  const redemptions = async (orderId) =>
    (await db.query("SELECT count(*)::int AS n FROM promotion_redemptions WHERE order_id = $1", [orderId])).rows[0].n;
  const reserved = async () =>
    (await db.query("SELECT i.reserved FROM inventory i JOIN product_variants v ON v.id = i.variant_id WHERE v.sku = 'SUB-P08'")).rows[0].reserved;
  const expireNow = (orderId) =>
    db.query("UPDATE stock_reservations SET expires_at = now() - interval '1 minute' WHERE order_id = $1", [orderId]);

  it("gives the use back when a pending order is cancelled, so the coupon can be used again", async () => {
    const first = await placeWithCoupon();
    assert.equal(await uses(), 1);
    await assert.rejects(placeWithCoupon(), (error) => error.code === "coupon_exhausted");

    await orders.cancelOrder("admin@example.com", first.id, "Cancelado por el cliente.");
    assert.equal(await uses(), 0);
    assert.equal(await redemptions(first.id), 0);
    // The order keeps its frozen discount as history.
    const cancelled = await orders.getOrder(first.id);
    assert.equal(cancelled.discountMinor, 89000);
    assert.equal(cancelled.couponCode, "QA10");

    const second = await placeWithCoupon();
    assert.equal(second.status, "pending_payment");
    assert.equal(await uses(), 1);
  });

  it("releases the stock reservation exactly as before", async () => {
    const order = await placeWithCoupon();
    assert.equal(await reserved(), 1);
    await orders.cancelOrder("admin@example.com", order.id, "Sin stock para el cliente.");
    assert.equal(await reserved(), 0);
    const { rows } = await db.query(
      "SELECT reason, delta_reserved FROM inventory_movements WHERE reservation_id IN (SELECT id FROM stock_reservations WHERE order_id = $1) ORDER BY created_at",
      [order.id],
    );
    assert.deepEqual(rows.map((row) => [row.reason, row.delta_reserved]), [
      ["reservation_created", 1],
      ["reservation_released", -1],
    ]);
  });

  it("does not give it back twice when the order had already expired", async () => {
    const expiring = await placeWithCoupon();
    await expireNow(expiring.id);
    await orders.releaseExpired();
    assert.equal((await orders.getOrder(expiring.id)).status, "expired");
    assert.equal(await uses(), 0);

    // Someone else uses the coupon meanwhile; cancelling the expired order must not free that use.
    const other = await placeWithCoupon();
    assert.equal(await uses(), 1);
    await orders.cancelOrder("admin@example.com", expiring.id, "Limpieza de pedidos vencidos.");
    assert.equal(await uses(), 1);
    assert.equal(await redemptions(other.id), 1);
  });

  it("gives it back once when cancel and expiry run at the same time", async () => {
    const order = await placeWithCoupon();
    await expireNow(order.id);
    const results = await Promise.allSettled([orders.cancelOrder("admin@example.com", order.id, "Cancelado."), orders.releaseExpired()]);
    assert.ok(results.every((result) => result.status === "fulfilled"), JSON.stringify(results));
    assert.ok(["cancelled", "expired"].includes((await orders.getOrder(order.id)).status));
    assert.equal(await uses(), 0);
    assert.equal(await reserved(), 0);
  });

  it("keeps the use of a paid order: paid orders cannot be cancelled", async () => {
    const order = await placeWithCoupon();
    await orders.confirmPayment("admin@example.com", order.id, "Transferencia.");
    await assert.rejects(orders.cancelOrder("admin@example.com", order.id, "No."), (error) => error.code === "invalid_transition");
    assert.equal(await uses(), 1);
    assert.equal(await redemptions(order.id), 1);
  });

  it("cancelling an order in review (paid late, no stock) frees nothing more", async () => {
    const order = await placeWithCoupon();
    await expireNow(order.id);
    await orders.releaseExpired();
    await db.exec("UPDATE inventory SET on_hand = 0, reserved = 0 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku = 'SUB-P08'");
    assert.equal(await orders.confirmPayment("mercadopago", order.id, "Pago tardío."), "needs_review");
    const other = await placeWithCoupon().catch(() => null);
    const before = await uses();
    await orders.cancelOrder("admin@example.com", order.id, "Sin stock: se devuelve el dinero.");
    assert.equal(await uses(), before);
    if (other) assert.equal(await redemptions(other.id), 1);
  });
});
