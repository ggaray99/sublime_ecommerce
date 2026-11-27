// The admin inventory list (/admin/inventario) and its movements filters: one
// row per tracked variant with physical, reserved and available stock, the
// product list's stock rule applied per variant, and summary numbers that match
// Productos and Inicio. Read-only: listing never writes.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createAdminRepository } from "../src/server/admin/repository.ts";
import { inventorySummary, searchInventory, signedQuantity, variantOptionsLabel } from "../src/server/inventory/admin-inventory.ts";
import {
  hasActiveInventoryFilters,
  hasActiveMovementFilters,
  inventorySearchToQuery,
  movementSearchToQuery,
  parseInventorySearch,
  parseMovementSearch,
} from "../src/server/inventory/inventory-search.ts";

const files = (folder) =>
  readdirSync(join("db", folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join("db", folder, name), "utf8"));

describe("inventory search URL (pure)", () => {
  it("parses every filter and round-trips through the query", () => {
    const search = parseInventorySearch({
      q: " remera ",
      estado: "bajo",
      categoria: "indumentaria",
      reservado: "con-reservas",
      activas: "todas",
      orden: "disponible-asc",
      pagina: "3",
    });
    assert.deepEqual(search, {
      query: "remera",
      state: "bajo",
      categoryId: "indumentaria",
      reserved: "con-reservas",
      inactive: "todas",
      sort: "disponible-asc",
      page: 3,
    });
    assert.equal(
      inventorySearchToQuery(search),
      "?q=remera&estado=bajo&categoria=indumentaria&reservado=con-reservas&activas=todas&orden=disponible-asc&pagina=3",
    );
    assert.deepEqual(parseInventorySearch(Object.fromEntries(new URLSearchParams(inventorySearchToQuery(search).slice(1)))), search);
    assert.ok(hasActiveInventoryFilters(search));
  });

  it("ignores invalid values and omits defaults", () => {
    const search = parseInventorySearch({ estado: "pedido", categoria: "NO VALE", reservado: "si", activas: "1", orden: "precio", pagina: "-2" });
    assert.deepEqual(search, { query: "", state: undefined, categoryId: undefined, reserved: undefined, inactive: undefined, sort: "producto", page: 1 });
    assert.equal(inventorySearchToQuery(search), "");
    assert.equal(hasActiveInventoryFilters(search), false);
    assert.equal(hasActiveInventoryFilters(parseInventorySearch({ orden: "sku", pagina: "2" })), false, "sort and page do not narrow");
    assert.equal(inventorySearchToQuery(search, { page: 2 }), "?pagina=2");
  });

  it("parses the movements filters with real Argentina dates", () => {
    const search = parseMovementSearch({ tipo: "reservas", q: "SUB-P08", desde: "2026-11-01", hasta: "2026-11-30", pagina: "2" });
    assert.deepEqual(search, { query: "SUB-P08", kind: "reservas", from: "2026-11-01", to: "2026-11-30", page: 2 });
    assert.equal(movementSearchToQuery(search), "?q=SUB-P08&tipo=reservas&desde=2026-11-01&hasta=2026-11-30&pagina=2");
    assert.deepEqual(parseMovementSearch({ tipo: "ventas", desde: "2026-02-30", hasta: "ayer" }), {
      query: "",
      kind: undefined,
      from: undefined,
      to: undefined,
      page: 1,
    });
    assert.equal(hasActiveMovementFilters(parseMovementSearch({ pagina: "4" })), false);
    assert.ok(hasActiveMovementFilters(parseMovementSearch({ tipo: "ajustes" })));
  });
});

describe("display helpers (pure)", () => {
  it("names a variant by its options in the product's order, or Única", () => {
    assert.equal(variantOptionsLabel(["Talle", "Color"], { Color: "Negro", Talle: "M" }), "Talle M · Color Negro");
    assert.equal(variantOptionsLabel([], {}), "Única");
    assert.equal(variantOptionsLabel(["Talle"], {}), "Única");
  });

  it("signs movement quantities and shows — for zero", () => {
    assert.deepEqual([4, -2, 0].map(signedQuantity), ["+4", "−2", "—"]);
  });
});

describe("searchInventory and inventorySummary (PGlite)", () => {
  let db;
  let sql;
  let admin;

  before(async () => {
    db = new PGlite();
    for (const text of [...files("migrations"), ...files("seed")]) await db.exec(text);
    sql = { query: async (text, params) => (await db.query(text, params)).rows };
    admin = createAdminRepository(sql);
    const setStock = (sku, onHand, reserved) =>
      `UPDATE inventory SET on_hand = ${onHand}, reserved = ${reserved} FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku = '${sku}';`;
    await db.exec(`
      ${setStock("SUB-P08", 10, 3)}
      ${setStock("SUB-P09", 8, 0)}
      UPDATE products SET low_stock_threshold = 10 WHERE legacy_id = 'p09';
      ${setStock("SUB-P10", 2, 2)}
      UPDATE product_variants SET track_stock = false WHERE sku = 'SUB-P12';
      -- p13 gets two options and three variants: the default (S), M and an inactive L.
      UPDATE products SET option_names = ARRAY['Talle', 'Color'] WHERE legacy_id = 'p13';
      UPDATE product_variants SET options = '{"Talle": "S", "Color": "Negro"}' WHERE sku = 'SUB-P13';
      ${setStock("SUB-P13", 4, 1)}
      INSERT INTO product_variants (product_id, sku, options, price_minor, track_stock, is_default, active)
        SELECT id, 'SUB-P13-M', '{"Talle": "M", "Color": "Negro"}', 1000, true, false, true FROM products WHERE legacy_id = 'p13';
      INSERT INTO product_variants (product_id, sku, options, price_minor, track_stock, is_default, active)
        SELECT id, 'SUB-P13-L', '{"Talle": "L", "Color": "Negro"}', 1000, true, false, false FROM products WHERE legacy_id = 'p13';
      INSERT INTO inventory (variant_id, on_hand, reserved) SELECT id, 20, 0 FROM product_variants WHERE sku = 'SUB-P13-M';
      INSERT INTO inventory (variant_id, on_hand, reserved) SELECT id, 7, 0 FROM product_variants WHERE sku = 'SUB-P13-L';
    `);
  });
  after(() => db.close());

  const search = (params) => searchInventory(sql, parseInventorySearch(params));
  const skus = (result) => result.items.map((item) => item.sku);

  it("lists one row per tracked variant with physical, reserved, available and the state", async () => {
    const result = await search({ q: "SUB-P08" });
    assert.equal(result.total, 1);
    const [row] = result.items;
    assert.equal(row.productId, "p08");
    assert.equal(row.productName, "Pack Caos Gráfico");
    assert.equal(row.optionsLabel, "Única");
    assert.deepEqual([row.onHand, row.reserved, row.available, row.state, row.active], [10, 3, 7, "in", true]);
    assert.ok(row.coverUrl.length > 0);
  });

  it("searches by product name or SKU; % and _ are literal", async () => {
    assert.deepEqual(skus(await search({ q: "caos gráfico" })), ["SUB-P08"]);
    assert.deepEqual(skus(await search({ q: "sub-p13" })).sort(), ["SUB-P13", "SUB-P13-M"]);
    assert.equal((await search({ q: "%" })).total, 0);
    assert.equal((await search({ q: "SUB_P08" })).total, 0);
  });

  it("applies the product rule per variant with the product's own threshold", async () => {
    const state = async (sku) => (await search({ q: sku })).items[0].state;
    assert.equal(await state("SUB-P09"), "low", "8 available with threshold 10");
    assert.equal(await state("SUB-P10"), "out", "all units reserved");
    assert.equal(await state("SUB-P13"), "low", "3 available with the default threshold 5");

    const sin = await search({ estado: "sin" });
    assert.ok(sin.items.length > 0 && sin.items.every((item) => item.available <= 0 && item.state === "out"));
    assert.ok(skus(sin).includes("SUB-P10"));
    const bajo = await search({ estado: "bajo" });
    assert.ok(bajo.items.every((item) => item.state === "low"));
    assert.ok(skus(bajo).includes("SUB-P09") && skus(bajo).includes("SUB-P13"));
    const con = await search({ estado: "con" });
    assert.ok(con.items.every((item) => item.available > 0));
    assert.ok(skus(con).includes("SUB-P08") && !skus(con).includes("SUB-P10"));
  });

  it("filters by category, reservations and includes inactive variants on request", async () => {
    const remeras = await search({ categoria: "indumentaria" });
    assert.ok(remeras.total > 0);
    const { rows } = await db.query(
      "SELECT count(*)::int AS n FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.category_id = 'indumentaria' AND v.track_stock AND v.active",
    );
    assert.equal(remeras.total, rows[0].n);

    const reserved = await search({ reservado: "con-reservas" });
    assert.ok(reserved.items.every((item) => item.reserved > 0));
    assert.deepEqual(skus(reserved).sort(), ["SUB-P08", "SUB-P10", "SUB-P13"]);

    assert.deepEqual(skus(await search({ q: "SUB-P13", orden: "sku" })), ["SUB-P13", "SUB-P13-M"]);
    const all = await search({ q: "SUB-P13", orden: "sku", activas: "todas" });
    assert.deepEqual(
      all.items.map((item) => [item.sku, item.active, item.optionsLabel]),
      [
        ["SUB-P13", true, "Talle S · Color Negro"],
        ["SUB-P13-L", false, "Talle L · Color Negro"],
        ["SUB-P13-M", true, "Talle M · Color Negro"],
      ],
    );
  });

  it("leaves out variants that do not keep stock (a pedido)", async () => {
    assert.equal((await search({ q: "SUB-P12" })).total, 0);
    const all = await search({ activas: "todas" });
    const { rows } = await db.query("SELECT count(*)::int AS n FROM product_variants WHERE track_stock");
    assert.equal(all.total, rows[0].n);
  });

  it("sorts by product, available, reserved and SKU", async () => {
    const q = "SUB-P1";
    const available = (result) => result.items.map((item) => item.available);
    const asc = available(await search({ q, orden: "disponible-asc" }));
    assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
    const desc = available(await search({ q, orden: "disponible-desc" }));
    assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
    const reserved = (await search({ q, orden: "reservado-desc" })).items.map((item) => item.reserved);
    assert.deepEqual(reserved, [...reserved].sort((a, b) => b - a));
    const bySku = skus(await search({ q, orden: "sku" }));
    assert.deepEqual(bySku, [...bySku].sort());
    const names = (await search({ q })).items.map((item) => item.productName);
    assert.deepEqual(names, [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it("pages the rows (50 per page) and clamps past the last page", async () => {
    const all = await search({ activas: "todas" });
    assert.equal(all.pageSize, 50);
    assert.equal(all.pages, Math.max(1, Math.ceil(all.total / 50)));
    assert.equal(all.items.length, Math.min(50, all.total));
    const small = await searchInventory(sql, { ...parseInventorySearch({ q: "SUB-P1", orden: "sku" }), pageSize: 2 });
    const last = await searchInventory(sql, { ...parseInventorySearch({ q: "SUB-P1", orden: "sku", pagina: "999" }), pageSize: 2 });
    assert.equal(last.page, small.pages);
    assert.equal(last.items.length, small.total - (small.pages - 1) * 2);
  });

  it("summarizes with manual sums and the same product counts as Productos and Inicio", async () => {
    const summary = await inventorySummary(sql);
    const facets = await admin.productFacets();
    assert.equal(summary.outOfStockProducts, facets.stock.sin);
    assert.equal(summary.lowStockProducts, facets.stock.bajo);
    assert.equal(summary.trackedProducts, facets.stock.con + facets.stock.sin);
    const { rows } = await db.query(`
      SELECT count(*)::int AS variants,
             coalesce(sum(greatest(0, coalesce(i.on_hand, 0) - coalesce(i.reserved, 0))), 0)::int AS available,
             coalesce(sum(i.reserved), 0)::int AS reserved
      FROM product_variants v LEFT JOIN inventory i ON i.variant_id = v.id
      WHERE v.track_stock AND v.active`);
    assert.deepEqual(
      [summary.trackedVariants, summary.availableUnits, summary.reservedUnits],
      [rows[0].variants, rows[0].available, rows[0].reserved],
    );
    assert.ok(summary.reservedUnits >= 6, "3 + 2 + 1 reserved units seeded above");
  });

  it("only reads: stock, reservations and movements are unchanged", async () => {
    const snapshot = async () =>
      (
        await db.query(`SELECT (SELECT count(*)::int FROM inventory_movements) AS movements,
                               (SELECT count(*)::int FROM stock_reservations) AS reservations,
                               (SELECT coalesce(sum(on_hand), 0)::int FROM inventory) AS on_hand,
                               (SELECT coalesce(sum(reserved), 0)::int FROM inventory) AS reserved`)
      ).rows[0];
    const beforeRead = await snapshot();
    await search({ activas: "todas", orden: "reservado-desc" });
    await inventorySummary(sql);
    assert.deepEqual(await snapshot(), beforeRead);
  });
});
