// Real-connection races for the inventory rules (docs/inventory-stabilization.md).
// PGlite has one connection, so these run only against a DISPOSABLE PostgreSQL:
//   CONCURRENCY_DATABASE_URL=postgres://…/sublime_concurrency_test npm run test:concurrency
// The database name must contain "concurrency_test"; the suite drops and recreates
// its public schema, applies every migration and the seed, and leaves it at that.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import pg from "pg";
import { createAdminRepository } from "../src/server/admin/repository.ts";
import { createOrderRepository } from "../src/server/orders/repository.ts";

const url = process.env.CONCURRENCY_DATABASE_URL;
const safe = Boolean(url && /concurrency_test/.test(new URL(url).pathname));
const ROUNDS = Number(process.env.CONCURRENCY_ROUNDS ?? 25);

const files = (folder) =>
  readdirSync(join("db", folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join("db", folder, name), "utf8"));

describe("inventory under real concurrency (PostgreSQL)", { skip: safe ? false : "set CONCURRENCY_DATABASE_URL to a *concurrency_test database" }, () => {
  let pool;
  let sql;
  let orders;
  let admin;
  let counter = 0;
  const owner = { authUserId: "auth-owner", email: "owner@example.com", role: "owner" };

  before(async () => {
    pool = new pg.Pool({ connectionString: url, max: 12 });
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    for (const text of [...files("migrations"), ...files("seed")]) await pool.query(text);
    sql = { query: async (text, params) => (await pool.query(text, params)).rows };
    orders = createOrderRepository(sql);
    admin = createAdminRepository(sql);
    await admin.grantAdmin(owner, "owner", "test");
  });
  after(() => pool?.end());

  /** Fresh stock for SUB-P08 with a ledger that matches it exactly. */
  beforeEach(async () => {
    await pool.query(`
      DELETE FROM inventory_movements WHERE variant_id = (SELECT id FROM product_variants WHERE sku = 'SUB-P08');
      UPDATE stock_reservations SET status = 'released', resolved_at = now() WHERE status = 'active';
      UPDATE inventory SET on_hand = 1000, reserved = 0 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku = 'SUB-P08';
      INSERT INTO inventory_movements (variant_id, delta_on_hand, reason, actor, note)
        SELECT id, 1000, 'initial_count', 'test', 'base' FROM product_variants WHERE sku = 'SUB-P08';
    `);
  });

  const place = (quantity = 1) =>
    orders.placeOrder({
      contactName: "Ana",
      contactEmail: "ana@example.com",
      contactPhone: "",
      delivery: { method: "pickup" },
      notes: "",
      shipping: { method: "pickup", costMinor: 0, label: "Retiro", ruleId: null, free: false, etaMinDays: null, etaMaxDays: null },
      idempotencyKey: `concurrency-${process.pid}-${++counter}-key`,
      customerId: null,
      lines: [{ sku: "SUB-P08", productId: "p08", name: "Pack", quantity, unitPriceMinor: 890000 }],
    });
  const dueNow = (orderId) => pool.query("UPDATE stock_reservations SET expires_at = now() - interval '1 second' WHERE order_id = $1", [orderId]);
  const state = async () => {
    const { rows } = await pool.query(`
      SELECT i.on_hand, i.reserved,
             (SELECT coalesce(sum(delta_on_hand), 0)::int FROM inventory_movements m WHERE m.variant_id = i.variant_id) AS ledger_on_hand,
             (SELECT coalesce(sum(delta_reserved), 0)::int FROM inventory_movements m WHERE m.variant_id = i.variant_id) AS ledger_reserved
      FROM inventory i JOIN product_variants v ON v.id = i.variant_id WHERE v.sku = 'SUB-P08'`);
    return rows[0];
  };
  const assertLedger = async (label) => {
    const s = await state();
    assert.equal(s.ledger_on_hand, s.on_hand, `${label}: movements add up to on_hand`);
    assert.equal(s.ledger_reserved, s.reserved, `${label}: movements add up to reserved`);
    return s;
  };

  it("repeated and simultaneous late confirmations discount once", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const order = await place(2);
      await dueNow(order.id);
      await orders.releaseExpired();
      const results = await Promise.allSettled([1, 2, 3].map((n) => orders.confirmPayment(n === 1 ? "mercadopago" : "admin@example.com", order.id, `intento ${n}`)));
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1, `round ${round}`);
      const { rows } = await pool.query(
        "SELECT count(*)::int AS n FROM inventory_movements WHERE reason = 'sale' AND note = 'Venta con pago tardío · Pedido SUB-' || $1",
        [order.number],
      );
      assert.equal(rows[0].n, 1, `round ${round}: one sale`);
    }
    const s = await assertLedger("late payments");
    assert.equal(s.on_hand, 1000 - 2 * ROUNDS);
  });

  it("a payment that meets the expiry is recorded once", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const order = await place(1);
      await dueNow(order.id);
      const results = await Promise.allSettled([orders.confirmPayment("mercadopago", order.id, "justo"), orders.releaseExpired(), orders.releaseExpired()]);
      assert.ok(results.every((r) => r.status === "fulfilled"), `round ${round}: ${JSON.stringify(results)}`);
      assert.equal((await orders.getOrder(order.id)).status, "paid", `round ${round}`);
    }
    const s = await assertLedger("payment vs expiry");
    assert.deepEqual([s.on_hand, s.reserved], [1000 - ROUNDS, 0]);
  });

  it("two simultaneous expiry runs release each reservation once", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const order = await place(1);
      await dueNow(order.id);
      const [a, b] = await Promise.all([orders.releaseExpired(), orders.releaseExpired()]);
      assert.equal(a.orders + b.orders, 1, `round ${round}`);
    }
    const s = await assertLedger("double expiry");
    assert.deepEqual([s.on_hand, s.reserved], [1000, 0]);
  });

  it("simultaneous counts keep the ledger equal to the stock", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const targets = [1010 + round, 1020 + round, 1005 + round];
      await Promise.allSettled(targets.map((onHand, i) => admin.countStock(owner, "p08", { onHand, reason: "adjustment", note: `conteo ${round}.${i}` })));
      const s = await assertLedger(`counts round ${round}`);
      assert.ok(targets.includes(s.on_hand), `round ${round}: on_hand is one of the counted values`);
    }
  });

  it("a count racing sales and reservations keeps the ledger equal to the stock", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const order = await place(1);
      await Promise.allSettled([
        orders.confirmPayment("mercadopago", order.id, "venta"),
        admin.countStock(owner, "p08", { onHand: 990, reason: "adjustment", note: `recuento ${round}` }),
        place(1),
      ]);
      await assertLedger(`count vs sale round ${round}`);
    }
  });

  it("restock never lowers, even when a sale lands first", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { on_hand } = await state();
      const order = await place(1);
      const results = await Promise.allSettled([
        orders.confirmPayment("mercadopago", order.id, "venta"),
        admin.countStock(owner, "p08", { onHand: on_hand, reason: "restock", note: "" }),
      ]);
      const count = results[1];
      // If the sale landed first, restocking to the old value would add; otherwise it is unchanged. Never a decrease.
      if (count.status === "rejected") assert.equal(count.reason.code, "restock_decrease");
      // A restock below the stock, racing another sale, is refused under the lock and writes nothing.
      const now = (await state()).on_hand;
      const other = await place(1);
      const [, lower] = await Promise.allSettled([
        orders.confirmPayment("mercadopago", other.id, "venta"),
        admin.countStock(owner, "p08", { onHand: now - 2, reason: "restock", note: "" }),
      ]);
      assert.equal(lower.status, "rejected", `round ${round}`);
      assert.equal(lower.reason.code, "restock_decrease");
      const { rows } = await pool.query("SELECT count(*)::int AS n FROM inventory_movements WHERE reason = 'restock' AND delta_on_hand < 0");
      assert.equal(rows[0].n, 0, `round ${round}`);
      await assertLedger(`restock round ${round}`);
    }
  });
});
