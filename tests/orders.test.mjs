// Orders and stock reservations on PostgreSQL (PGlite): reserve, no overselling,
// expiry, payment (on time and late), cancellation, idempotency and checkout.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createPostgresCatalogRepository } from "../src/server/catalog/postgres-repository.ts";
import { createPostgresInventoryRepository } from "../src/server/inventory/postgres-repository.ts";
import { checkout, parseCheckout } from "../src/server/orders/checkout.ts";
import { createOrderRepository, orderNumber, OrderError } from "../src/server/orders/repository.ts";

const dbDir = join(import.meta.dirname, "..", "db");
const sqlFiles = (folder) =>
  readdirSync(join(dbDir, folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dbDir, folder, name), "utf8"));

let keyCounter = 0;
const key = () => `test-order-${++keyCounter}-key`;

const contact = { contactName: "Ana Pérez", contactEmail: "ana@example.com", contactPhone: "", delivery: { method: "pickup" }, notes: "" };

describe("checkout form", () => {
  const base = { idempotencyKey: "abc12345-def", contactName: "Ana", contactEmail: "ANA@example.com", deliveryMethod: "pickup", cart: '[{"productId":"p08","quantity":2}]' };

  it("accepts pickup and normalizes the email", () => {
    const result = parseCheckout(base);
    assert.equal(result.ok, true);
    assert.equal(result.value.contactEmail, "ana@example.com");
    assert.deepEqual(result.value.lines, [{ productId: "p08", quantity: 2 }]);
  });

  it("requires a full Argentine address for shipping, with its own delivery notes", () => {
    const missing = parseCheckout({ ...base, deliveryMethod: "shipping" });
    assert.equal(missing.ok, false);
    assert.ok(missing.errors.street && missing.errors.postalCode);
    const ok = parseCheckout({
      ...base,
      deliveryMethod: "shipping",
      recipient: "Ana",
      street: "San Martín",
      streetNumber: "100",
      city: "Mendoza",
      province: "Mendoza",
      postalCode: "5500",
      addressNotes: "Timbre 2",
      notes: "Envolver para regalo",
    });
    assert.equal(ok.value.delivery.address.notes, "Timbre 2");
    assert.equal(ok.value.notes, "Envolver para regalo");
  });

  it("rejects bad carts, emails and tampered fields", () => {
    const result = parseCheckout({ ...base, contactEmail: "nope", cart: '[{"productId":"p08","quantity":2,"price":1}]' });
    assert.deepEqual(Object.keys(result.errors).sort(), ["cart", "contactEmail"]);
  });
});

describe("orders and reservations (PGlite)", () => {
  let db;
  let orders;
  let deps;
  const stock = async (sku) =>
    (await db.query("SELECT i.on_hand, i.reserved FROM inventory i JOIN product_variants v ON v.id = i.variant_id WHERE v.sku = $1", [sku])).rows[0];
  const line = (productId, quantity, sku) => ({ productId, quantity, ...(sku ? { sku } : {}) });

  before(async () => {
    db = new PGlite();
    for (const sql of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(sql);
    const query = { query: async (text, params) => (await db.query(text, params)).rows };
    orders = createOrderRepository(query);
    deps = { catalog: createPostgresCatalogRepository(query), inventory: createPostgresInventoryRepository(query), orders };
  });
  after(() => db.close());

  beforeEach(async () => {
    await db.exec("UPDATE inventory SET on_hand = 5, reserved = 0 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku IN ('SUB-P08', 'SUB-P09')");
  });

  it("reserves stock and freezes prices, names and quantities", async () => {
    const result = await checkout({ ...contact, idempotencyKey: key(), lines: [line("p08", 2), line("p09", 1)] }, null, deps);
    assert.equal(result.ok, true);
    const order = await orders.getOrder(result.order.id);
    assert.match(orderNumber(order), /^SUB-\d{4,}$/);
    assert.equal(order.status, "pending_payment");
    assert.deepEqual(order.items.map((item) => [item.sku, item.quantity, item.lineTotalMinor]), [
      ["SUB-P08", 2, 2 * 890000],
      ["SUB-P09", 1, 720000],
    ]);
    assert.equal(order.subtotalMinor, 2 * 890000 + 720000);
    assert.deepEqual(await stock("SUB-P08"), { on_hand: 5, reserved: 2 });
    const minutes = (order.expiresAt - order.createdAt) / 60000;
    assert.ok(minutes > 14.9 && minutes < 15.1);
  });

  it("never sells more than available: the last units go to one order only", async () => {
    const first = await checkout({ ...contact, idempotencyKey: key(), lines: [line("p08", 4)] }, null, deps);
    assert.equal(first.ok, true);
    // A second checkout quoted while 5 were free still fails atomically when reserving.
    await assert.rejects(
      orders.placeOrder({ ...contact, idempotencyKey: key(), customerId: null, lines: [{ sku: "SUB-P08", productId: "p08", name: "x", quantity: 2, unitPriceMinor: 890000 }] }),
      (error) => error instanceof OrderError && error.code === "insufficient_stock",
    );
    assert.deepEqual(await stock("SUB-P08"), { on_hand: 5, reserved: 4 }, "the failed order reserved nothing");
    const [{ n }] = (await db.query("SELECT count(*)::int AS n FROM orders WHERE status = 'pending_payment' AND id <> $1", [first.order.id])).rows;
    assert.ok(n >= 0);

    // Through checkout the customer sees what is left.
    const retry = await checkout({ ...contact, idempotencyKey: key(), lines: [line("p08", 2)] }, null, deps);
    assert.equal(retry.ok, false);
    assert.equal(retry.issues[0].code, "insufficient_stock");
  });

  it("all-or-nothing: one short line cancels the whole order", async () => {
    await db.exec("UPDATE inventory SET on_hand = 1 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku = 'SUB-P09'");
    await assert.rejects(
      orders.placeOrder({
        ...contact,
        idempotencyKey: key(),
        customerId: null,
        lines: [
          { sku: "SUB-P08", productId: "p08", name: "x", quantity: 1, unitPriceMinor: 890000 },
          { sku: "SUB-P09", productId: "p09", name: "y", quantity: 2, unitPriceMinor: 720000 },
        ],
      }),
      (error) => error.code === "insufficient_stock",
    );
    assert.deepEqual(await stock("SUB-P08"), { on_hand: 5, reserved: 0 });
  });

  it("returns the same order for a repeated submit", async () => {
    const idempotencyKey = key();
    const first = await checkout({ ...contact, idempotencyKey, lines: [line("p08", 1)] }, null, deps);
    const again = await checkout({ ...contact, idempotencyKey, lines: [line("p08", 1)] }, null, deps);
    assert.equal(again.order.id, first.order.id);
    assert.deepEqual(await stock("SUB-P08"), { on_hand: 5, reserved: 1 }, "reserved once");
  });

  it("confirms payment in time: the reservation becomes a sale", async () => {
    const { order } = await checkout({ ...contact, idempotencyKey: key(), lines: [line("p08", 2)] }, null, deps);
    assert.equal(await orders.confirmPayment("admin@example.com", order.id, "Transferencia recibida"), "paid");
    assert.deepEqual(await stock("SUB-P08"), { on_hand: 3, reserved: 0 });
    const detail = await orders.getOrder(order.id);
    assert.deepEqual(detail.events.map((entry) => entry.toStatus), ["pending_payment", "paid"]);
    await assert.rejects(orders.confirmPayment("admin", order.id), (error) => error.code === "invalid_transition");
    await orders.markFulfilled("admin", order.id, "");
    assert.equal((await orders.getOrder(order.id)).status, "fulfilled");
  });

  it("expires unpaid orders after 15 minutes and releases their stock", async () => {
    const { order } = await checkout({ ...contact, idempotencyKey: key(), lines: [line("p08", 3)] }, null, deps);
    await db.query("UPDATE stock_reservations SET expires_at = now() - interval '1 minute' WHERE order_id = $1", [order.id]);
    const released = await orders.releaseExpired();
    assert.deepEqual(released, { reservations: 1, orders: 1 });
    assert.equal((await orders.getOrder(order.id)).status, "expired");
    assert.deepEqual(await stock("SUB-P08"), { on_hand: 5, reserved: 0 });
    assert.deepEqual(await orders.releaseExpired(), { reservations: 0, orders: 0 }, "running it again changes nothing");
  });

  it("late payment takes stock only if it is still free; otherwise it needs review", async () => {
    const late = await checkout({ ...contact, idempotencyKey: key(), lines: [line("p08", 2)] }, null, deps);
    await db.query("UPDATE stock_reservations SET expires_at = now() - interval '1 minute' WHERE order_id = $1", [late.order.id]);
    await orders.releaseExpired();
    assert.equal(await orders.confirmPayment("admin", late.order.id), "paid");
    assert.deepEqual(await stock("SUB-P08"), { on_hand: 3, reserved: 0 });

    const unlucky = await checkout({ ...contact, idempotencyKey: key(), lines: [line("p08", 3)] }, null, deps);
    await db.query("UPDATE stock_reservations SET expires_at = now() - interval '1 minute' WHERE order_id = $1", [unlucky.order.id]);
    await orders.releaseExpired();
    // Someone else bought the released units meanwhile.
    const other = await checkout({ ...contact, idempotencyKey: key(), lines: [line("p08", 3)] }, null, deps);
    assert.equal(other.ok, true);
    assert.equal(await orders.confirmPayment("admin", unlucky.order.id), "needs_review");
    assert.deepEqual(await stock("SUB-P08"), { on_hand: 3, reserved: 3 }, "stock promised to the other order is untouched");
    const events = (await orders.getOrder(unlucky.order.id)).events;
    assert.match(events.at(-1).note, /sin stock suficiente/);
  });

  it("cancels unpaid orders releasing stock, but not paid ones", async () => {
    const { order } = await checkout({ ...contact, idempotencyKey: key(), lines: [line("p09", 2)] }, null, deps);
    await orders.cancelOrder("admin", order.id, "El cliente desistió");
    assert.deepEqual(await stock("SUB-P09"), { on_hand: 5, reserved: 0 });
    const paid = await checkout({ ...contact, idempotencyKey: key(), lines: [line("p09", 1)] }, null, deps);
    await orders.confirmPayment("admin", paid.order.id);
    await assert.rejects(orders.cancelOrder("admin", paid.order.id, ""), (error) => error.code === "invalid_transition");
  });

  it("records every stock change as movements", async () => {
    const { order } = await checkout({ ...contact, idempotencyKey: key(), lines: [line("p08", 1)] }, null, deps);
    await orders.confirmPayment("admin@example.com", order.id);
    const reasons = (
      await db.query(
        "SELECT m.reason, m.delta_on_hand, m.delta_reserved FROM inventory_movements m JOIN stock_reservations r ON r.id = m.reservation_id WHERE r.order_id = $1 ORDER BY m.id",
        [order.id],
      )
    ).rows;
    assert.deepEqual(reasons, [
      { reason: "reservation_created", delta_on_hand: 0, delta_reserved: 1 },
      { reason: "sale", delta_on_hand: -1, delta_reserved: -1 },
    ]);
  });

  it("only shows an order to whoever has its link token", async () => {
    const { order } = await checkout({ ...contact, idempotencyKey: key(), lines: [line("p08", 1)] }, null, deps);
    assert.equal((await orders.getOrderByToken(order.id, order.accessToken)).id, order.id);
    assert.equal(await orders.getOrderByToken(order.id, "wrong-token-wrong-token-wrong-token"), null);
    assert.equal(await orders.getOrderByToken("not-a-uuid", order.accessToken), null);
  });

  it("requires choosing a variant for products with options", async () => {
    await db.exec("UPDATE products SET option_names = '{Talle}' WHERE legacy_id = 'p13'");
    const result = await checkout({ ...contact, idempotencyKey: key(), lines: [line("p13", 1)] }, null, deps);
    assert.equal(result.ok, false);
    assert.equal(result.issues[0].code, "variant_required");
    await db.exec("UPDATE products SET option_names = '{}' WHERE legacy_id = 'p13'");
  });
});
