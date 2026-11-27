// Inventory detail (/admin/inventario/[productId]): the per-variant breakdown,
// active reservations and the adjustment dialog's preview. Display only: the
// stock is still written by countStockAction → countStock (absolute count).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  adjustmentConfirmText,
  countResultMessage,
  expectedResultText,
  planAdjustment,
  reservationExpiryText,
  signedDelta,
  variantOptionsText,
} from "../src/components/admin/inventory/detail-helpers.ts";
import { createAdminRepository } from "../src/server/admin/repository.ts";
import { MAX_STOCK, parseStockCount } from "../src/server/admin/validation.ts";
import { createVariantRepository } from "../src/server/admin/variants-repository.ts";
import { activeReservations, inventoryDetail } from "../src/server/inventory/admin-detail.ts";
import { createOrderRepository } from "../src/server/orders/repository.ts";

const files = (folder) =>
  readdirSync(join("db", folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join("db", folder, name), "utf8"));

describe("inventory detail helpers (pure)", () => {
  it("writes variant options, or Única for a single variant", () => {
    assert.equal(variantOptionsText({ Talle: "M", Color: "Negro" }, ["Talle", "Color"]), "Talle M · Color Negro");
    assert.equal(variantOptionsText({ Color: "Negro", Talle: "M" }, []), "Color Negro · Talle M");
    assert.equal(variantOptionsText({}, []), "Única");
  });

  it("signs deltas with a real minus sign", () => {
    assert.deepEqual([signedDelta(3), signedDelta(-2), signedDelta(0)], ["+3", "−2", "0"]);
  });

  it("adds or subtracts units, then shows the absolute result", () => {
    const plan = planAdjustment({ onHand: 10, reserved: 2, mode: "delta", amount: "-3", reason: "adjustment", note: "Rotura", maxStock: MAX_STOCK });
    assert.deepEqual([plan.result, plan.available, plan.valid], [7, 5, true]);
    assert.deepEqual(plan.errors, {});
    assert.equal(planAdjustment({ onHand: 10, reserved: 0, mode: "delta", amount: "+5", reason: "restock", note: "", maxStock: MAX_STOCK }).result, 15);
  });

  it("counts the total as an absolute number", () => {
    const plan = planAdjustment({ onHand: 10, reserved: 2, mode: "total", amount: "4", reason: "restock", note: "", maxStock: MAX_STOCK });
    assert.deepEqual([plan.result, plan.available, plan.valid], [4, 2, true]);
    const signed = planAdjustment({ onHand: 10, reserved: 0, mode: "total", amount: "-4", reason: "restock", note: "", maxStock: MAX_STOCK });
    assert.equal(signed.valid, false);
    assert.match(signed.errors.amount, /entera entre 0 y 100000/);
  });

  it("blocks results below zero, below the reserved units or above the maximum", () => {
    const negative = planAdjustment({ onHand: 3, reserved: 0, mode: "delta", amount: "-5", reason: "restock", note: "", maxStock: MAX_STOCK });
    assert.equal(negative.valid, false);
    assert.equal(negative.errors.amount, "El resultado no puede ser negativo: hay 3 unidades en depósito.");

    const reserved = planAdjustment({ onHand: 10, reserved: 6, mode: "total", amount: "5", reason: "restock", note: "", maxStock: MAX_STOCK });
    assert.equal(reserved.valid, false);
    assert.equal(reserved.errors.amount, "Hay 6 unidades reservadas: el stock no puede quedar en menos de 6.");

    const big = planAdjustment({ onHand: 10, reserved: 0, mode: "delta", amount: "100000", reason: "restock", note: "", maxStock: MAX_STOCK });
    assert.equal(big.valid, false);
    assert.equal(big.errors.amount, "El stock puede ser de hasta 100000 unidades.");
  });

  it("rejects non-integers and empty amounts", () => {
    for (const amount of ["", "1.5", "abc", "--2", "1e3"]) {
      const plan = planAdjustment({ onHand: 1, reserved: 0, mode: "delta", amount, reason: "restock", note: "", maxStock: MAX_STOCK });
      assert.equal(plan.valid, false, amount);
      assert.equal(plan.result, null, amount);
    }
    const empty = planAdjustment({ onHand: 1, reserved: 0, mode: "delta", amount: " ", reason: "restock", note: "", maxStock: MAX_STOCK });
    assert.equal(empty.errors.amount, "Ingresá cuántas unidades sumar o restar.");
  });

  it("requires a note for an Ajuste, like the server", () => {
    const missing = planAdjustment({ onHand: 5, reserved: 0, mode: "delta", amount: "1", reason: "adjustment", note: "  ", maxStock: MAX_STOCK });
    assert.equal(missing.valid, false);
    assert.equal(missing.errors.note, "Explicá el ajuste (por ejemplo: rotura, recuento).");
    const long = planAdjustment({ onHand: 5, reserved: 0, mode: "delta", amount: "1", reason: "restock", note: "x".repeat(201), maxStock: MAX_STOCK });
    assert.equal(long.errors.note, "La nota puede tener hasta 200 caracteres.");
    assert.equal(planAdjustment({ onHand: 5, reserved: 0, mode: "delta", amount: "1", reason: "restock", note: "", maxStock: MAX_STOCK }).valid, true);
  });

  it("describes the expected result and the confirmation", () => {
    assert.equal(expectedResultText(7, 2), "Resultado esperado: 7 unidades en depósito (disponibles: 5).");
    assert.equal(expectedResultText(1, 0), "Resultado esperado: 1 unidad en depósito (disponibles: 1).");
    assert.equal(adjustmentConfirmText(10, 7), "Vas a pasar de 10 a 7 unidades. ¿Confirmás?");
  });

  it("writes the reservation expiry in Argentina time", () => {
    assert.equal(reservationExpiryText(new Date("2026-11-27T02:05:00Z")), "vence 26/11 23:05");
  });

  it("says when a count changed nothing", () => {
    assert.equal(countResultMessage(8, 8), "Sin cambios: el stock ya era 8.");
    assert.equal(countResultMessage(8, 9), "Stock actualizado.");
    assert.equal(countResultMessage(null, 9), "Stock actualizado.");
  });

  it("keeps the server validation of a count unchanged", () => {
    assert.equal(parseStockCount({ onHand: "5", reason: "adjustment", note: "" }).ok, false);
    assert.equal(parseStockCount({ onHand: "-1", reason: "restock", note: "" }).ok, false);
    assert.equal(parseStockCount({ onHand: String(MAX_STOCK + 1), reason: "restock", note: "" }).ok, false);
    const ok = parseStockCount({ onHand: "4", reason: "restock", note: "" });
    assert.deepEqual([ok.ok, ok.value], [true, { onHand: 4, reason: "restock", note: "" }]);
  });
});

describe("inventory detail queries (PGlite)", () => {
  let db;
  let sql;
  let orders;
  let admin;
  let variants;
  let counter = 0;
  const owner = { authUserId: "auth-owner", email: "owner@example.com", role: "owner" };

  before(async () => {
    db = new PGlite();
    for (const text of [...files("migrations"), ...files("seed")]) await db.exec(text);
    sql = { query: async (text, params) => (await db.query(text, params)).rows };
    orders = createOrderRepository(sql);
    admin = createAdminRepository(sql);
    variants = createVariantRepository(sql);
    await admin.grantAdmin(owner, "owner", "test");
    // p13 with sizes S, M, L; L inactive with stock left on it.
    await variants.configureOptions(owner, "p13", [{ name: "Talle", values: ["S", "M", "L"] }]);
    await admin.countStock(owner, "p13", { onHand: 10, reason: "restock", note: "" }, "SUB-P13");
    await admin.countStock(owner, "p13", { onHand: 4, reason: "restock", note: "" }, "SUB-P13-M");
    await admin.countStock(owner, "p13", { onHand: 3, reason: "restock", note: "" }, "SUB-P13-L");
    const large = (await variants.listVariants("p13")).find((variant) => variant.sku === "SUB-P13-L");
    await variants.updateVariant(owner, "p13", large.id, { priceMinor: large.priceMinor, active: false });
  });
  after(() => db.close());

  const place = (sku, quantity) =>
    orders.placeOrder({
      contactName: "Ana",
      contactEmail: "ana@example.com",
      contactPhone: "",
      delivery: { method: "pickup" },
      notes: "",
      shipping: { method: "pickup", costMinor: 0, label: "Retiro", ruleId: null, free: false, etaMinDays: null, etaMaxDays: null },
      idempotencyKey: `inventory-detail-${++counter}-key`,
      customerId: null,
      lines: [{ sku, productId: "p13", name: "Remera", quantity, unitPriceMinor: 1_000_000 }],
    });

  it("lists every variant, inactive included, with physical, reserved and available", async () => {
    const open = await place("SUB-P13", 2);
    const detail = await inventoryDetail(sql, "p13");
    assert.equal(detail.id, "p13");
    assert.equal(detail.trackStock, true);
    assert.deepEqual(detail.optionNames, ["Talle"]);
    assert.equal(detail.defaultSku, "SUB-P13");
    assert.equal(detail.threshold, 5);
    const rows = detail.variants.map((v) => [v.sku, v.options.Talle, v.active, v.onHand, v.reserved, v.available]);
    assert.deepEqual(rows, [
      ["SUB-P13", "S", true, 10, 2, 8],
      ["SUB-P13-M", "M", true, 4, 0, 4],
      ["SUB-P13-L", "L", false, 3, 0, 3],
    ]);
    // Totals follow the product rule: active variants only.
    assert.deepEqual(detail.totals, { onHand: 14, reserved: 2, available: 12 });
    await orders.cancelOrder("owner@example.com", open.id, "Prueba.");
  });

  it("lists only active reservations, with their order number and expiry", async () => {
    const first = await place("SUB-P13-M", 1);
    const second = await place("SUB-P13", 3);
    const cancelled = await place("SUB-P13", 1);
    await orders.cancelOrder("owner@example.com", cancelled.id, "Prueba.");
    const paid = await place("SUB-P13", 1);
    await orders.confirmPayment("owner@example.com", paid.id, "Transferencia.");

    const list = await activeReservations(sql, "p13");
    assert.deepEqual(
      list.map((r) => [r.sku, r.quantity, r.order?.number]).sort((a, b) => a[2] - b[2]),
      [
        ["SUB-P13-M", 1, first.number],
        ["SUB-P13", 3, second.number],
      ],
    );
    assert.ok(list.every((r) => r.expiresAt instanceof Date));
    assert.equal(list.find((r) => r.sku === "SUB-P13-M").options.Talle, "M");
    assert.equal(list.find((r) => r.order.number === second.number).order.id, second.id);
    assert.deepEqual(await activeReservations(sql, "p08"), []);
  });

  it("reads the product threshold and the made-to-order flag", async () => {
    await db.exec("UPDATE products SET low_stock_threshold = 2 WHERE legacy_id = 'p08'");
    const p08 = await inventoryDetail(sql, "p08");
    assert.deepEqual([p08.threshold, p08.lowStockThreshold, p08.optionNames, p08.variants.length], [2, 2, [], 1]);
    const p21 = await inventoryDetail(sql, "p21");
    assert.equal(p21.trackStock, false);
    assert.equal(p21.status, "active");
  });

  it("answers null for an unknown or malformed product", async () => {
    assert.equal(await inventoryDetail(sql, "zz999"), null);
    assert.equal(await inventoryDetail(sql, "NO VALE"), null);
    assert.deepEqual(await activeReservations(sql, "NO VALE"), []);
  });

  it("only reads: stock and ledger are unchanged", async () => {
    const snapshot = async () => (await db.query("SELECT (SELECT count(*)::int FROM inventory_movements) AS m, (SELECT sum(on_hand)::int FROM inventory) AS s")).rows[0];
    const before = await snapshot();
    await inventoryDetail(sql, "p13");
    await activeReservations(sql, "p13");
    assert.deepEqual(await snapshot(), before);
  });
});
