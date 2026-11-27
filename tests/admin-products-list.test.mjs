// Admin products list (/admin/productos): the stock badge follows the same
// rule as the "bajo"/"sin" filters, the price column, and the bulk status and
// featured actions (input parsing and the result message).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  BULK_PRODUCT_ACTIONS,
  bulkProductChange,
  bulkResultMessage,
  LOW_STOCK,
  listPrice,
  parseBulkProductInput,
  parseProductSearch,
  productStockState,
} from "../src/server/admin/product-search.ts";
import { createAdminRepository } from "../src/server/admin/repository.ts";

const dbDir = join(import.meta.dirname, "..", "db");
const sqlFiles = (folder) =>
  readdirSync(join(dbDir, folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dbDir, folder, name), "utf8"));

const stock = (trackStock, onHand, reserved = 0, lowStockThreshold = null) => ({ trackStock, onHand, reserved, lowStockThreshold });

describe("stock state of a list row", () => {
  it("is untracked for made-to-order products, whatever the counts", () => {
    assert.equal(productStockState(stock(false, 0)), "untracked");
    assert.equal(productStockState(stock(false, 3)), "untracked");
  });

  it("is out at zero available or less, counting reservations", () => {
    assert.equal(productStockState(stock(true, 0)), "out");
    assert.equal(productStockState(stock(true, 4, 4)), "out");
  });

  it("is low from 1 up to the store default threshold", () => {
    assert.equal(productStockState(stock(true, 1)), "low");
    assert.equal(productStockState(stock(true, LOW_STOCK)), "low");
    assert.equal(productStockState(stock(true, LOW_STOCK + 1)), "in");
    assert.equal(productStockState(stock(true, LOW_STOCK + 3, 3)), "low", "available = on hand - reserved");
  });

  it("uses the product's own threshold when it has one", () => {
    assert.equal(productStockState(stock(true, 8, 0, 10)), "low");
    assert.equal(productStockState(stock(true, 3, 0, 2)), "in");
    assert.equal(productStockState(stock(true, 1, 0, 0)), "in", "threshold 0 never alerts");
  });
});

describe("price column", () => {
  it("shows the default price, or 'desde' the lowest when variants differ", () => {
    assert.deepEqual(listPrice({ requiresQuote: false, priceMinor: 150000, minPriceMinor: 150000, maxPriceMinor: 150000 }), { kind: "fixed", minor: 150000 });
    assert.deepEqual(listPrice({ requiresQuote: false, priceMinor: 150000, minPriceMinor: 120000, maxPriceMinor: 180000 }), { kind: "from", minor: 120000 });
    assert.deepEqual(listPrice({ requiresQuote: true, priceMinor: null, minPriceMinor: null, maxPriceMinor: null }), { kind: "quote" });
    assert.deepEqual(listPrice({ requiresQuote: false, priceMinor: null, minPriceMinor: null, maxPriceMinor: null }), { kind: "missing" });
  });
});

describe("bulk product actions input", () => {
  it("accepts an allowed action and a list of ids, without duplicates", () => {
    assert.deepEqual(parseBulkProductInput({ action: "publish", ids: ["p1", "base-remera", "p1"] }, 50), {
      ok: true,
      action: "publish",
      ids: ["p1", "base-remera"],
    });
  });

  it("refuses unknown actions, empty or malformed id lists and too many ids", () => {
    const error = (input) => parseBulkProductInput(input, 3).ok;
    assert.equal(error({ action: "delete", ids: ["p1"] }), false);
    assert.equal(error({ action: "publish", ids: [] }), false);
    assert.equal(error({ action: "publish", ids: "p1" }), false);
    assert.equal(error({ action: "publish", ids: [1] }), false);
    assert.equal(error({ action: "publish", ids: ["x".repeat(41)] }), false);
    assert.equal(error({ action: "publish", ids: ["a", "b", "c", "d"] }), false);
    assert.equal(error(null), false);
    const tooMany = parseBulkProductInput({ action: "publish", ids: ["a", "b", "c", "d"] }, 3);
    assert.equal(tooMany.ok ? "" : tooMany.error, "Podés cambiar hasta 3 productos por vez.");
  });

  it("maps every action to a status or featured change", () => {
    assert.deepEqual(
      BULK_PRODUCT_ACTIONS.map((action) => bulkProductChange(action)),
      [{ status: "active" }, { status: "draft" }, { status: "archived" }, { featured: true }, { featured: false }],
    );
  });
});

describe("bulk result message", () => {
  const item = (id, name = id) => ({ id, name });

  it("counts what changed and what was already that way", () => {
    assert.deepEqual(bulkResultMessage("publish", { changed: [item("a"), item("b"), item("c")], unchanged: [item("d")], skipped: [] }), {
      message: "3 productos publicados. 1 sin cambios.",
      tone: "success",
    });
    assert.deepEqual(bulkResultMessage("unfeature", { changed: [item("a")], unchanged: [], skipped: [] }), {
      message: "1 producto sin destacar.",
      tone: "success",
    });
  });

  it("lists every skipped product with its reason", () => {
    const result = {
      changed: [item("a"), item("b"), item("c")],
      unchanged: [item("d")],
      skipped: [{ ...item("e", "Remera sin precio"), reason: "Ingresá un precio para publicar el producto." }],
    };
    assert.deepEqual(bulkResultMessage("publish", result), {
      message: "3 productos publicados. 1 sin cambios. 1 no se pudo: Remera sin precio (Ingresá un precio para publicar el producto).",
      tone: "warning",
    });
    const none = bulkResultMessage("archive", {
      changed: [],
      unchanged: [],
      skipped: [
        { ...item("x"), reason: "El producto no existe." },
        { ...item("y", "Taza"), reason: "No se pudo guardar." },
      ],
    });
    assert.deepEqual(none, { message: "Ningún producto archivado. 2 no se pudieron: x (El producto no existe); Taza (No se pudo guardar).", tone: "critical" });
  });

  it("says when nothing needed a change", () => {
    assert.deepEqual(bulkResultMessage("feature", { changed: [], unchanged: [item("a"), item("b")], skipped: [] }), {
      message: "Ningún producto destacado. 2 sin cambios.",
      tone: "info",
    });
  });
});

describe("list rows on PostgreSQL (PGlite)", () => {
  let db;
  let repo;
  const sku = (id) => `SUB-${id.toUpperCase()}`;
  const search = (params = {}) => parseProductSearch(params);

  before(async () => {
    db = new PGlite();
    for (const sql of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(sql);
    repo = createAdminRepository({ query: async (text, params) => (await db.query(text, params)).rows });
    await db.exec(`
      UPDATE inventory SET on_hand = 0 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku = '${sku("p08")}';
      UPDATE inventory SET on_hand = 3 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku = '${sku("p09")}';
      -- Own threshold: 8 available is low for p12 (10), not for the store default (5).
      UPDATE inventory SET on_hand = 8 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku = '${sku("p12")}';
      UPDATE products SET low_stock_threshold = 10 WHERE legacy_id = 'p12';
      -- A second, dearer variant for p13; an inactive cheaper one is ignored.
      INSERT INTO product_variants (product_id, sku, options, price_minor, track_stock, is_default, active)
        SELECT id, 'SUB-P13-XL', '{"talle":"XL"}', 2500000, false, false, true FROM products WHERE legacy_id = 'p13';
      INSERT INTO product_variants (product_id, sku, options, price_minor, track_stock, is_default, active)
        SELECT id, 'SUB-P13-XS', '{"talle":"XS"}', 1, false, false, false FROM products WHERE legacy_id = 'p13';
    `);
  });
  after(() => db.close());

  it("carries each product's low-stock threshold", async () => {
    const { items } = await repo.searchProducts(search({ q: "SUB-P12" }));
    assert.equal(items[0].lowStockThreshold, 10);
    const [other] = (await repo.searchProducts(search({ q: "SUB-P09" }))).items;
    assert.equal(other.lowStockThreshold, null);
  });

  it("gives every row of the 'bajo' and 'sin' filters the matching badge", async () => {
    const rows = async (stockFilter) => (await repo.searchProducts(search({ stock: stockFilter }))).items;
    const low = await rows("bajo");
    assert.deepEqual(low.map((item) => item.id).sort(), ["p09", "p12"]);
    assert.ok(low.every((item) => productStockState(item) === "low"));
    assert.ok((await rows("sin")).every((item) => productStockState(item) === "out"));
    assert.ok((await rows("pedido")).every((item) => productStockState(item) === "untracked"));
    // And the other way round: no row outside the filter shows the badge.
    const all = [...(await repo.searchProducts(search())).items, ...(await repo.searchProducts(search({ pagina: "2" }))).items];
    assert.deepEqual(all.filter((item) => productStockState(item) === "low").map((item) => item.id).sort(), ["p09", "p12"]);
  });

  it("reads the price range over the active variants", async () => {
    const [p13] = (await repo.searchProducts(search({ q: "SUB-P13" }))).items;
    assert.equal(p13.maxPriceMinor, 2500000);
    assert.equal(p13.minPriceMinor, p13.priceMinor);
    assert.deepEqual(listPrice(p13), { kind: "from", minor: p13.priceMinor });
  });
});
