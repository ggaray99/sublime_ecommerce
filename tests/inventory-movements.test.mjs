// Inventory movements as the admin reads them: the 7 ledger reasons grouped
// into entradas, salidas, ajustes and reservas; readable actors; and the order
// a movement came from (through its reservation). Read-only over
// inventory_movements: nothing is copied or rewritten.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createAdminRepository } from "../src/server/admin/repository.ts";
import { createOrderRepository } from "../src/server/orders/repository.ts";
import { listInventoryMovements } from "../src/server/inventory/movements.ts";
import { MOVEMENT_KINDS, movementActorLabel, movementKind, movementLabel } from "../src/server/inventory/movement-view.ts";

const files = (folder) =>
  readdirSync(join("db", folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join("db", folder, name), "utf8"));

describe("movement view (pure)", () => {
  it("groups the 7 ledger reasons", () => {
    assert.deepEqual(
      ["initial_count", "restock", "adjustment", "sale", "reservation_created", "reservation_released", "reservation_expired"].map(movementKind),
      ["entrada", "entrada", "ajuste", "salida", "reserva", "reserva", "reserva"],
    );
    assert.equal(movementKind("algo_nuevo"), "ajuste");
    assert.deepEqual(MOVEMENT_KINDS.map((kind) => kind.value), ["entradas", "salidas", "ajustes", "reservas"]);
  });

  it("labels every reason in Spanish", () => {
    assert.deepEqual(
      ["initial_count", "restock", "adjustment", "sale", "reservation_created", "reservation_released", "reservation_expired"].map(movementLabel),
      ["Carga inicial", "Reposición", "Ajuste", "Venta", "Reserva por pedido", "Reserva liberada (pedido cancelado)", "Reserva vencida"],
    );
    assert.equal(movementLabel("raro"), "raro");
  });

  it("makes actors readable and keeps emails", () => {
    assert.equal(movementActorLabel("checkout"), "Checkout de la tienda");
    assert.equal(movementActorLabel("system"), "Sistema (vencimiento automático)");
    assert.equal(movementActorLabel("mercadopago"), "Mercado Pago");
    assert.equal(movementActorLabel("seed"), "Carga inicial del catálogo");
    assert.equal(movementActorLabel("integration:ERP"), "Integración: ERP");
    assert.equal(movementActorLabel("ana@example.com"), "ana@example.com");
  });
});

describe("listInventoryMovements (PGlite)", () => {
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
    // A clean ledger for SUB-P08 so the expectations are exact.
    await db.exec(`
      DELETE FROM inventory_movements WHERE variant_id = (SELECT id FROM product_variants WHERE sku = 'SUB-P08');
      UPDATE inventory SET on_hand = 10, reserved = 0 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku = 'SUB-P08';
    `);
  });
  after(() => db.close());

  const place = (quantity = 1) =>
    orders.placeOrder({
      contactName: "Ana",
      contactEmail: "ana@example.com",
      contactPhone: "",
      delivery: { method: "pickup" },
      notes: "",
      shipping: { method: "pickup", costMinor: 0, label: "Retiro", ruleId: null, free: false, etaMinDays: null, etaMaxDays: null },
      idempotencyKey: `inventory-movements-${++counter}-key`,
      customerId: null,
      lines: [{ sku: "SUB-P08", productId: "p08", name: "Pack", quantity, unitPriceMinor: 890000 }],
    });

  it("lists a product's movements newest first, with the order they came from", async () => {
    const paid = await place(2);
    await orders.confirmPayment("owner@example.com", paid.id, "Transferencia.");
    const cancelled = await place(1);
    await orders.cancelOrder("owner@example.com", cancelled.id, "Sin stock para el cliente.");
    await admin.countStock(owner, "p08", { onHand: 12, reason: "restock", note: "Llegó mercadería" });

    const result = await listInventoryMovements(sql, { productId: "p08" });
    const rows = result.items.map((m) => [m.reason, m.kind, m.deltaOnHand, m.deltaReserved, m.order?.number ?? null, m.actor]);
    assert.deepEqual(rows, [
      ["restock", "entrada", 4, 0, null, "owner@example.com"],
      ["reservation_released", "reserva", 0, -1, cancelled.number, "owner@example.com"],
      ["reservation_created", "reserva", 0, 1, cancelled.number, "checkout"],
      ["sale", "salida", -2, -2, paid.number, "owner@example.com"],
      ["reservation_created", "reserva", 0, 2, paid.number, "checkout"],
    ]);
    const first = result.items[0];
    assert.equal(first.sku, "SUB-P08");
    assert.equal(first.productId, "p08");
    assert.equal(first.productName, "Pack Caos Gráfico");
    assert.equal(first.note, "Llegó mercadería");
    assert.ok(first.createdAt instanceof Date);
    assert.equal(result.items[1].order.id, cancelled.id);
    assert.equal(result.total, 5);
  });

  it("filters by kind, by SKU or product text and pages the results", async () => {
    const reservas = await listInventoryMovements(sql, { productId: "p08", kind: "reservas" });
    assert.ok(reservas.items.every((m) => m.kind === "reserva"));
    assert.equal(reservas.total, 3);
    assert.deepEqual((await listInventoryMovements(sql, { productId: "p08", kind: "salidas" })).items.map((m) => m.reason), ["sale"]);
    assert.deepEqual((await listInventoryMovements(sql, { productId: "p08", kind: "entradas" })).items.map((m) => m.reason), ["restock"]);

    const bySku = await listInventoryMovements(sql, { q: "sub-p08" });
    assert.ok(bySku.total >= 5 && bySku.items.every((m) => m.sku === "SUB-P08"));
    const byName = await listInventoryMovements(sql, { q: "caos" });
    assert.ok(byName.items.every((m) => m.productName === "Pack Caos Gráfico"));
    assert.equal((await listInventoryMovements(sql, { q: "%" })).total, 0, "LIKE wildcards are literal");

    const page1 = await listInventoryMovements(sql, { productId: "p08", pageSize: 2, page: 1 });
    const page3 = await listInventoryMovements(sql, { productId: "p08", pageSize: 2, page: 3 });
    assert.deepEqual([page1.items.length, page3.items.length, page1.pages], [2, 1, 3]);
    const past = await listInventoryMovements(sql, { productId: "p08", pageSize: 2, page: 99 });
    assert.equal(past.page, 3);
  });

  it("filters by Argentina dates and by variant", async () => {
    const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    assert.equal((await listInventoryMovements(sql, { productId: "p08", desde: today, hasta: today })).total, 5);
    assert.equal((await listInventoryMovements(sql, { productId: "p08", hasta: "2020-01-01" })).total, 0);
    const { rows } = await db.query("SELECT id FROM product_variants WHERE sku = 'SUB-P08'");
    assert.equal((await listInventoryMovements(sql, { variantId: rows[0].id })).total, 5);
    assert.equal((await listInventoryMovements(sql, { variantId: "no-es-uuid" })).total, 0);
    assert.equal((await listInventoryMovements(sql, { productId: "zz999" })).total, 0);
  });

  it("only reads: the ledger and stock are unchanged by listing", async () => {
    const snapshot = async () => (await db.query("SELECT count(*)::int AS n, coalesce(sum(delta_on_hand), 0)::int AS s FROM inventory_movements")).rows[0];
    const before = await snapshot();
    await listInventoryMovements(sql, {});
    assert.deepEqual(await snapshot(), before);
  });
});
