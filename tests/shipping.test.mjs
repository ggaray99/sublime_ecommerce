// Shipping: rule precedence (pure), database guarantees, checkout integration and dispatch.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createPostgresCatalogRepository } from "../src/server/catalog/postgres-repository.ts";
import { createPostgresInventoryRepository } from "../src/server/inventory/postgres-repository.ts";
import { checkout } from "../src/server/orders/checkout.ts";
import { createOrderRepository } from "../src/server/orders/repository.ts";
import { createShippingRepository, parsePickup, parseShippingRule } from "../src/server/shipping/repository.ts";
import { cityKey, etaLabel, findRule, postalNumber, quoteShipping } from "../src/server/shipping/rules.ts";

const dbDir = join(import.meta.dirname, "..", "db");
const sqlFiles = (folder) =>
  readdirSync(join(dbDir, folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dbDir, folder, name), "utf8"));

const rule = (patch) => ({
  id: patch.scope,
  label: patch.scope,
  province: null,
  city: null,
  postalFrom: null,
  postalTo: null,
  available: true,
  costMinor: 100,
  freeFromMinor: null,
  etaMinDays: 1,
  etaMaxDays: 2,
  active: true,
  ...patch,
});
const rules = [
  rule({ scope: "default", costMinor: 950000 }),
  rule({ scope: "province", province: "Mendoza", costMinor: 450000, freeFromMinor: 6000000 }),
  rule({ scope: "city", province: "Mendoza", city: "Godoy Cruz", costMinor: 250000 }),
  rule({ scope: "postal_code", postalFrom: 5500, postalTo: 5500, costMinor: 200000 }),
  rule({ id: "tdf", scope: "province", province: "Tierra del Fuego", available: false }),
];
const at = (province, city, postalCode) => ({ province, city, postalCode });

describe("shipping rules (pure)", () => {
  it("reads Argentine postal codes and normalizes cities", () => {
    assert.equal(postalNumber("M5500ABC"), 5500);
    assert.equal(postalNumber("5500"), 5500);
    assert.equal(postalNumber("55"), null);
    assert.equal(cityKey("  Godoy  CRUZ "), "godoy cruz");
    assert.equal(cityKey("San Martín"), "san martin");
  });

  it("applies the most specific rule: postal code > city > province > default", () => {
    assert.equal(findRule(rules, at("Mendoza", "Mendoza", "M5500ABC")).scope, "postal_code");
    assert.equal(findRule(rules, at("Mendoza", "godoy cruz", "5501")).scope, "city");
    assert.equal(findRule(rules, at("Mendoza", "San Rafael", "5600")).scope, "province");
    assert.equal(findRule(rules, at("Córdoba", "Córdoba", "5000")).scope, "default");
  });

  it("a city in another province does not match", () => {
    assert.equal(findRule(rules, at("San Juan", "Godoy Cruz", "5400")).scope, "default");
  });

  it("quotes cost, free shipping and delivery time", () => {
    const mendoza = quoteShipping(rules, at("Mendoza", "San Rafael", "5600"), 5_000_000);
    assert.deepEqual([mendoza.covered, mendoza.costMinor, mendoza.free], [true, 450000, false]);
    const free = quoteShipping(rules, at("Mendoza", "San Rafael", "5600"), 6_000_000);
    assert.deepEqual([free.costMinor, free.free, free.baseCostMinor], [0, true, 450000]);
    assert.equal(etaLabel(2, 4), "2 a 4 días hábiles");
    assert.equal(etaLabel(1, 1), "1 día hábil");
  });

  it("reports areas without coverage, and no rule at all", () => {
    const tdf = quoteShipping(rules, at("Tierra del Fuego", "Ushuaia", "9410"), 100);
    assert.deepEqual([tdf.covered, tdf.ruleId], [false, "tdf"]);
    assert.equal(quoteShipping(rules.filter((r) => r.scope !== "default"), at("Salta", "Salta", "4400"), 100).covered, false);
    assert.equal(quoteShipping(rules.map((r) => ({ ...r, active: false })), at("Mendoza", "Mendoza", "5500"), 100).covered, false);
  });

  it("validates rules from forms and JSON", () => {
    const ok = parseShippingRule({ scope: "postal_code", label: "Gran Mendoza", postalFrom: "5500", postalTo: "5599", cost: "3.000", etaMinDays: "1", etaMaxDays: "2" });
    assert.deepEqual([ok.value.postalFrom, ok.value.postalTo, ok.value.costMinor], [5500, 5599, 300000]);
    const bad = parseShippingRule({ scope: "city", label: "", province: "Narnia", postalFrom: "", cost: "-1", etaMinDays: "5", etaMaxDays: "2" });
    assert.deepEqual(Object.keys(bad.errors).sort(), ["city", "cost", "etaMinDays", "label", "province"]);
    assert.equal(parseShippingRule({ scope: "postal_code", label: "x", postalFrom: "5599", postalTo: "5500", cost: "1" }).ok, false);
    assert.equal(parsePickup({ enabled: "on", address: "" }).ok, false);
  });
});

describe("shipping on PostgreSQL (PGlite)", () => {
  let db;
  let shipping;
  let orders;
  let deps;
  const admin = { authUserId: "auth-admin", email: "admin@example.com" };
  const input = (patch) => parseShippingRule({ cost: "1000", etaMinDays: "1", etaMaxDays: "2", ...patch }).value;
  const customer = { contactName: "Ana Pérez", contactEmail: "ana@example.com", contactPhone: "", notes: "" };
  const address = (postalCode, city = "Mendoza", province = "Mendoza") => ({
    method: "shipping",
    address: { recipient: "Ana", street: "San Martín", streetNumber: "100", apartment: "", city, province, postalCode, notes: "" },
  });

  before(async () => {
    db = new PGlite();
    for (const sql of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(sql);
    const query = { query: async (text, params) => (await db.query(text, params)).rows };
    shipping = createShippingRepository(query);
    orders = createOrderRepository(query);
    deps = { catalog: createPostgresCatalogRepository(query), inventory: createPostgresInventoryRepository(query), orders, shipping };
  });
  after(() => db.close());

  it("loads the demo rules and pickup point", async () => {
    assert.equal((await shipping.listRules()).length, 5);
    const pickup = await shipping.getPickup();
    assert.equal(pickup.enabled, true);
    assert.match(pickup.address, /demo/);
  });

  it("forbids overlapping postal codes and duplicate zones among active rules", async () => {
    await assert.rejects(shipping.createRule(admin, input({ scope: "postal_code", label: "Solapa", postalFrom: "5400", postalTo: "5550" })), (error) => {
      return error.code === "conflict" && /superpone/.test(error.message);
    });
    await assert.rejects(shipping.createRule(admin, input({ scope: "province", label: "Otra Mendoza", province: "Mendoza" })), (error) => error.code === "conflict");
    await assert.rejects(shipping.createRule(admin, input({ scope: "default", label: "Otro default" })), (error) => error.code === "conflict");
    // Inactive rules do not count.
    const id = await shipping.createRule(admin, input({ scope: "province", label: "Mendoza (borrador)", province: "Mendoza", active: "false" }));
    assert.ok(id);
  });

  it("edits and deletes rules, auditing each change", async () => {
    const id = await shipping.createRule(admin, input({ scope: "postal_code", label: "San Juan capital", postalFrom: "5400", postalTo: "5400" }));
    await shipping.updateRule(admin, id, input({ scope: "postal_code", label: "San Juan capital", postalFrom: "5400", postalTo: "5402", cost: "1.500" }));
    const updated = (await shipping.listRules()).find((r) => r.id === id);
    assert.deepEqual([updated.postalFrom, updated.postalTo, updated.costMinor], [5400, 5402, 150000]);
    await shipping.deleteRule(admin, id);
    assert.equal((await shipping.listRules()).some((r) => r.id === id), false);
    const [{ n }] = (await db.query("SELECT count(*)::int AS n FROM audit_logs WHERE entity = 'shipping' AND entity_id = $1", [id])).rows;
    assert.equal(n, 3);
  });

  it("checkout charges the shipping quoted on the server and freezes it", async () => {
    const result = await checkout({ ...customer, idempotencyKey: "ship-order-0001", delivery: address("M5500ABC"), lines: [{ productId: "p08", quantity: 1 }] }, null, deps);
    assert.equal(result.ok, true);
    const order = await orders.getOrder(result.order.id);
    assert.equal(order.shippingMinor, 200000);
    assert.deepEqual([order.shipping.method, order.shipping.label, order.shipping.free], ["shipping", "Mendoza Capital (CP 5500) · demo", false]);
  });

  it("applies free shipping over the threshold and rejects areas without coverage", async () => {
    const big = await checkout(
      { ...customer, idempotencyKey: "ship-order-0002", delivery: address("5600", "San Rafael"), lines: [{ productId: "p13", quantity: 4 }] },
      null,
      deps,
    );
    assert.equal(big.ok, true);
    assert.deepEqual([big.order.shippingMinor, big.order.shipping.free], [0, true], "4 remeras ≥ $ 60.000");
    const far = await checkout(
      { ...customer, idempotencyKey: "ship-order-0003", delivery: address("9410", "Ushuaia", "Tierra del Fuego"), lines: [{ productId: "p08", quantity: 1 }] },
      null,
      deps,
    );
    assert.deepEqual([far.ok, far.reason], [false, "shipping"]);
  });

  it("pickup is free and can be turned off", async () => {
    const pick = await checkout({ ...customer, idempotencyKey: "ship-order-0004", delivery: { method: "pickup" }, lines: [{ productId: "p08", quantity: 1 }] }, null, deps);
    assert.deepEqual([pick.order.shippingMinor, pick.order.shipping.method], [0, "pickup"]);
    await shipping.setPickup(admin, { enabled: false, address: "", hours: "", notes: "" });
    const off = await checkout({ ...customer, idempotencyKey: "ship-order-0005", delivery: { method: "pickup" }, lines: [{ productId: "p08", quantity: 1 }] }, null, deps);
    assert.deepEqual([off.ok, off.reason], [false, "shipping"]);
    await shipping.setPickup(admin, { enabled: true, address: "Taller", hours: "", notes: "" });
  });

  it("ships paid orders with tracking before delivering; pickups are delivered directly", async () => {
    const [shipped] = await orders.listOrders({ limit: 10 }).then((list) => list.filter((o) => o.delivery.method === "shipping" && o.status === "pending_payment"));
    await orders.confirmPayment("admin", shipped.id);
    await assert.rejects(orders.markFulfilled("admin", shipped.id, ""), /enviado/);
    await orders.markShipped("admin", shipped.id, { carrier: "Correo Argentino", code: "CA123", url: "" }, "");
    const sent = await orders.getOrder(shipped.id);
    assert.deepEqual([sent.status, sent.tracking.code], ["shipped", "CA123"]);
    assert.ok(sent.shippedAt);
    await orders.markFulfilled("admin", shipped.id, "");
    assert.equal((await orders.getOrder(shipped.id)).status, "fulfilled");

    const [pickupOrder] = await orders.listOrders({ limit: 10 }).then((list) => list.filter((o) => o.delivery.method === "pickup" && o.status === "pending_payment"));
    await orders.confirmPayment("admin", pickupOrder.id);
    await assert.rejects(orders.markShipped("admin", pickupOrder.id, { carrier: "x", code: "", url: "" }, ""), /envío a domicilio/);
    await orders.markFulfilled("admin", pickupOrder.id, "");
    assert.equal((await orders.getOrder(pickupOrder.id)).events.at(-1).note, "Retirado en el taller.");
  });
});
