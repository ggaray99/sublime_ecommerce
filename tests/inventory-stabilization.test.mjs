// Inventory stabilization (docs/inventory-stabilization.md): late payments
// traceable and idempotent, counts computed against the locked stock, restock
// only adds, scheduled expiry. PGlite runs on one connection, so "at the same
// time" here means interleaved calls; real-connection races run in
// tests/db-concurrency.test.mjs against PostgreSQL.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { AdminDataError, createAdminRepository } from "../src/server/admin/repository.ts";
import { createOrderRepository } from "../src/server/orders/repository.ts";
import { listInventoryMovements } from "../src/server/inventory/movements.ts";
import { runScheduledExpiry } from "../src/server/inventory/scheduled-expiry.ts";

const files = (folder) =>
  readdirSync(join("db", folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join("db", folder, name), "utf8"));

describe("inventory stabilization (PGlite)", () => {
  let db;
  let sql;
  let orders;
  let admin;
  let counter = 0;
  const owner = { authUserId: "auth-owner", email: "owner@example.com", role: "owner" };

  before(async () => {
    db = new PGlite();
    for (const text of [...files("migrations"), ...files("seed")]) await db.exec(text);
    sql = { query: async (text, params) => (await db.query(text, params)).rows };
    orders = createOrderRepository(sql);
    admin = createAdminRepository(sql);
    await admin.grantAdmin(owner, "owner", "test");
  });
  after(() => db.close());
  beforeEach(() => db.exec("UPDATE inventory SET on_hand = 10, reserved = 0 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku = 'SUB-P08'"));

  const place = (quantity = 1) =>
    orders.placeOrder({
      contactName: "Ana",
      contactEmail: "ana@example.com",
      contactPhone: "",
      delivery: { method: "pickup" },
      notes: "",
      shipping: { method: "pickup", costMinor: 0, label: "Retiro", ruleId: null, free: false, etaMinDays: null, etaMaxDays: null },
      idempotencyKey: `stabilization-${++counter}-key`,
      customerId: null,
      lines: [{ sku: "SUB-P08", productId: "p08", name: "Pack", quantity, unitPriceMinor: 890000 }],
    });
  const stock = async () =>
    (await db.query("SELECT i.on_hand, i.reserved FROM inventory i JOIN product_variants v ON v.id = i.variant_id WHERE v.sku = 'SUB-P08'")).rows[0];
  const expire = async (orderId) => {
    await db.query("UPDATE stock_reservations SET expires_at = now() - interval '1 minute' WHERE order_id = $1", [orderId]);
    await orders.releaseExpired();
  };
  const sales = async (orderId) =>
    (await listInventoryMovements(sql, { productId: "p08", kind: "salidas" })).items.filter((m) => m.order?.id === orderId);
  /** Sum of the ledger equals on_hand for every tracked variant (the seed starts consistent). */
  const ledgerMatches = async () =>
    (
      await db.query(`
        SELECT count(*)::int AS broken FROM inventory i
        JOIN product_variants v ON v.id = i.variant_id
        WHERE i.on_hand <> coalesce((SELECT sum(delta_on_hand) FROM inventory_movements m WHERE m.variant_id = i.variant_id), 0)
          AND v.sku <> 'SUB-P08'`)
    ).rows[0].broken === 0;

  describe("1. late payments", () => {
    it("a late sale names its order and links back to it", async () => {
      const order = await place(2);
      await expire(order.id);
      assert.equal(await orders.confirmPayment("mercadopago", order.id, "Pago tardío."), "paid");
      const [sale] = await sales(order.id);
      assert.ok(sale, "the late sale is linked to its order");
      assert.match(sale.note, new RegExp(`Pedido SUB-${order.number}`));
      assert.equal(sale.deltaOnHand, -2);
      assert.equal(sale.deltaReserved, 0, "the expired reservation is not used again");
      assert.deepEqual(await stock(), { on_hand: 8, reserved: 0 });
    });

    it("repeated confirmations discount once (on time and late)", async () => {
      const onTime = await place(1);
      await orders.confirmPayment("mercadopago", onTime.id, "Aprobado.");
      await assert.rejects(orders.confirmPayment("mercadopago", onTime.id, "Aprobado otra vez."), (error) => error.code === "invalid_transition");
      const late = await place(1);
      await expire(late.id);
      await orders.confirmPayment("mercadopago", late.id, "Tarde.");
      await assert.rejects(orders.confirmPayment("mercadopago", late.id, "Tarde otra vez."), (error) => error.code === "invalid_transition");
      assert.deepEqual(await stock(), { on_hand: 8, reserved: 0 });
      assert.equal((await sales(onTime.id)).length, 1);
      assert.equal((await sales(late.id)).length, 1);
      const events = (await db.query("SELECT to_status FROM order_events WHERE order_id = $1 AND to_status = 'paid'", [late.id])).rows;
      assert.equal(events.length, 1, "one 'paid' event");
    });

    it("concurrent late confirmations of the same order discount once", async () => {
      const order = await place(3);
      await expire(order.id);
      const results = await Promise.allSettled([
        orders.confirmPayment("mercadopago", order.id, "A"),
        orders.confirmPayment("admin@example.com", order.id, "B"),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1, JSON.stringify(results));
      assert.deepEqual(await stock(), { on_hand: 7, reserved: 0 });
      assert.equal((await sales(order.id)).length, 1);
    });

    it("keeps needs_review when there is no stock left, with no stock change", async () => {
      const order = await place(2);
      await expire(order.id);
      await db.exec("UPDATE inventory SET on_hand = 1, reserved = 0 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku = 'SUB-P08'");
      assert.equal(await orders.confirmPayment("mercadopago", order.id, "Tarde sin stock."), "needs_review");
      assert.deepEqual(await stock(), { on_hand: 1, reserved: 0 });
      assert.equal((await sales(order.id)).length, 0);
    });

    it("a payment that meets the expiry is still recorded once (as on time or late)", async () => {
      const order = await place(2);
      await db.query("UPDATE stock_reservations SET expires_at = now() - interval '1 minute' WHERE order_id = $1", [order.id]);
      const results = await Promise.allSettled([orders.confirmPayment("mercadopago", order.id, "Justo."), orders.releaseExpired()]);
      assert.ok(results.every((r) => r.status === "fulfilled"), JSON.stringify(results));
      assert.equal((await orders.getOrder(order.id)).status, "paid");
      assert.deepEqual(await stock(), { on_hand: 8, reserved: 0 });
      assert.equal((await sales(order.id)).length, 1);
    });
  });

  describe("2-3. counts and restock", () => {
    const count = (onHand, reason, note = "") => admin.countStock(owner, "p08", { onHand, reason, note });

    it("records the difference against the stock at write time (count after a sale)", async () => {
      const order = await place(4);
      await orders.confirmPayment("mercadopago", order.id, "Venta."); // 10 → 6
      await count(9, "restock", "Llegó mercadería");
      const [movement] = (await listInventoryMovements(sql, { productId: "p08", kind: "entradas" })).items;
      assert.equal(movement.deltaOnHand, 3, "9 − 6, not 9 − 10");
      assert.deepEqual(await stock(), { on_hand: 9, reserved: 0 });
    });

    it("two counts in a row each record their own difference", async () => {
      await Promise.all([count(12, "restock", "A"), count(15, "restock", "B")]);
      const deltas = (await listInventoryMovements(sql, { productId: "p08", kind: "entradas" })).items.slice(0, 2).map((m) => m.deltaOnHand);
      const { on_hand } = await stock();
      assert.equal(10 + deltas.reduce((a, b) => a + b, 0), on_hand, `deltas ${deltas} reach ${on_hand}`);
    });

    it("restock only adds; lowering needs Ajuste with a reason", async () => {
      await assert.rejects(count(7, "restock", "No"), (error) => error instanceof AdminDataError && error.code === "restock_decrease");
      assert.deepEqual(await stock(), { on_hand: 10, reserved: 0 }, "nothing written");
      await count(7, "adjustment", "Rotura en depósito");
      assert.deepEqual(await stock(), { on_hand: 7, reserved: 0 });
      await count(9, "restock", ""); // restock without note is still allowed
      assert.deepEqual(await stock(), { on_hand: 9, reserved: 0 });
    });

    it("never below the reserved units, and a refused count writes nothing", async () => {
      await place(3);
      const before = (await db.query("SELECT count(*)::int AS n FROM inventory_movements")).rows[0].n;
      await assert.rejects(count(2, "adjustment", "Recuento"), (error) => error.code === "below_reserved");
      assert.equal((await db.query("SELECT count(*)::int AS n FROM inventory_movements")).rows[0].n, before);
    });

    it("an equal count writes nothing", async () => {
      const before = (await db.query("SELECT count(*)::int AS n FROM inventory_movements")).rows[0].n;
      await count(10, "adjustment", "Recuento");
      assert.equal((await db.query("SELECT count(*)::int AS n FROM inventory_movements")).rows[0].n, before);
    });

    it("the ledger still matches the stock for every other variant", async () => {
      assert.ok(await ledgerMatches());
    });
  });

  describe("7. scheduled expiry", () => {
    it("releases due reservations once, as system, and reports the run", async () => {
      const order = await place(2);
      await db.query("UPDATE stock_reservations SET expires_at = now() - interval '1 minute' WHERE order_id = $1", [order.id]);
      const [first, second] = await Promise.all([runScheduledExpiry(orders), runScheduledExpiry(orders)]);
      assert.equal(first.orders + second.orders, 1);
      assert.equal(first.reservations + second.reservations, 1);
      assert.equal((await orders.getOrder(order.id)).status, "expired");
      assert.deepEqual(await stock(), { on_hand: 10, reserved: 0 });
      const released = (await listInventoryMovements(sql, { productId: "p08", kind: "reservas" })).items.filter((m) => m.reason === "reservation_expired" && m.order?.id === order.id);
      assert.equal(released.length, 1);
      assert.equal(released[0].actor, "system");
    });

    it("only touches active reservations that are due", async () => {
      const fresh = await place(1);
      assert.deepEqual(await runScheduledExpiry(orders), { reservations: 0, orders: 0 });
      assert.equal((await orders.getOrder(fresh.id)).status, "pending_payment");
    });

    it("reports an error instead of throwing", async () => {
      const result = await runScheduledExpiry({ releaseExpired: async () => { throw new Error("db down"); } });
      assert.deepEqual(result, { error: "db down" });
    });
  });
});
