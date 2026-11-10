// Admin product list: URL filters, SQL filtering, sorting, pagination and counts.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { products as staticProducts } from "../src/data/products.ts";
import { PAGE_SIZE, parseProductSearch, productSearchToQuery } from "../src/server/admin/product-search.ts";
import { createAdminRepository } from "../src/server/admin/repository.ts";

const dbDir = join(import.meta.dirname, "..", "db");
const sqlFiles = (folder) =>
  readdirSync(join(dbDir, folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dbDir, folder, name), "utf8"));

const search = (params = {}) => parseProductSearch(params);

describe("admin search parameters", () => {
  it("reads known values and ignores anything else", () => {
    assert.deepEqual(
      search({ q: " gato ", estado: "draft", categoria: "stickers", tematica: "argentina", stock: "sin", imagenes: "con", destacado: "si", orden: "precio-asc", pagina: "3" }),
      { query: "gato", status: "draft", categoryId: "stickers", theme: "argentina", stock: "sin", images: "con", featured: "si", sort: "precio-asc", page: 3 },
    );
    const junk = search({ estado: "deleted", categoria: "x'; DROP", stock: "todo", orden: "random()", pagina: "-2" });
    assert.deepEqual([junk.status, junk.categoryId, junk.stock, junk.sort, junk.page], [undefined, undefined, undefined, "orden", 1]);
  });

  it("writes compact URLs that read back the same", () => {
    const value = search({ categoria: "packs", stock: "bajo", orden: "nombre" });
    assert.equal(productSearchToQuery(value), "?categoria=packs&stock=bajo&orden=nombre");
    assert.deepEqual(parseProductSearch(Object.fromEntries(new URLSearchParams(productSearchToQuery(value, { page: 2 })))), { ...value, page: 2 });
    assert.equal(productSearchToQuery(search()), "", "defaults are omitted");
  });
});

describe("admin product search on PostgreSQL (PGlite)", () => {
  let db;
  let repo;
  const sku = (id) => `SUB-${id.toUpperCase()}`;

  before(async () => {
    db = new PGlite();
    for (const sql of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(sql);
    repo = createAdminRepository({ query: async (text, params) => (await db.query(text, params)).rows });
    // Shape the data: one product without stock, one with low stock, one without photos.
    await db.exec(`
      UPDATE inventory SET on_hand = 0 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku = '${sku("p08")}';
      UPDATE inventory SET on_hand = 3 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku = '${sku("p09")}';
      DELETE FROM product_images WHERE product_id = (SELECT id FROM products WHERE legacy_id = 'p10');
      UPDATE products SET status = 'draft' WHERE legacy_id = 'p11';
    `);
  });
  after(() => db.close());

  it("paginates the whole catalog", async () => {
    const first = await repo.searchProducts(search());
    assert.equal(first.total, staticProducts.length);
    assert.equal(first.items.length, PAGE_SIZE);
    const second = await repo.searchProducts(search({ pagina: "2" }));
    assert.equal(second.items.length, staticProducts.length - PAGE_SIZE);
    const beyond = await repo.searchProducts(search({ pagina: "99" }));
    assert.equal(beyond.page, beyond.pages, "out-of-range pages show the last one");
  });

  it("filters by stock situation", async () => {
    const ids = async (stock) => (await repo.searchProducts(search({ stock }))).items.map((item) => item.id);
    assert.ok((await ids("sin")).includes("p08"));
    assert.deepEqual(await ids("bajo"), ["p09"]);
    const madeToOrder = await ids("pedido");
    assert.equal(madeToOrder.length, staticProducts.filter((product) => product.requiresQuote).length);
    assert.equal((await ids("con")).includes("p08"), false);
  });

  it("filters by photos, status, category, theme and featured", async () => {
    assert.deepEqual((await repo.searchProducts(search({ imagenes: "sin" }))).items.map((item) => item.id), ["p10"]);
    assert.deepEqual((await repo.searchProducts(search({ estado: "draft" }))).items.map((item) => item.id), ["p11"]);
    const stickers = await repo.searchProducts(search({ categoria: "stickers" }));
    assert.equal(stickers.total, staticProducts.filter((product) => product.category === "stickers").length);
    const theme = await repo.searchProducts(search({ tematica: "argentina" }));
    assert.equal(theme.total, staticProducts.filter((product) => product.theme === "argentina").length);
    const featured = await repo.searchProducts(search({ destacado: "si" }));
    assert.equal(featured.total, staticProducts.filter((product) => product.featured).length);
  });

  it("combines filters and searches names, SKUs, codes and tags", async () => {
    const tagged = staticProducts.find((product) => product.tags.length && product.category === "stickers");
    const byTag = await repo.searchProducts(search({ q: tagged.tags[0], categoria: "stickers" }));
    assert.ok(byTag.items.some((item) => item.id === tagged.id));
    assert.ok(byTag.items.every((item) => item.categoryId === "stickers"));
    assert.equal((await repo.searchProducts(search({ q: "088" }))).items[0].catalogCode, "088");
  });

  it("sorts by price, nulls (quoted products) last", async () => {
    const { items } = await repo.searchProducts(search({ orden: "precio-asc" }));
    const prices = items.map((item) => item.priceMinor).filter((price) => price !== null);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  });

  it("counts every option over the whole catalog", async () => {
    const facets = await repo.productFacets();
    assert.equal(facets.total, staticProducts.length);
    assert.equal(facets.status.active + facets.status.draft + facets.status.archived, facets.total);
    assert.equal(facets.stock.con + facets.stock.sin + facets.stock.pedido, facets.total);
    assert.deepEqual([facets.stock.bajo, facets.images.sin, facets.status.draft], [1, 1, 1]);
    assert.equal(
      Object.values(facets.categories).reduce((sum, n) => sum + n, 0),
      facets.total,
    );
  });
});
