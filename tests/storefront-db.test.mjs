// Regression: the catalog read from Postgres (migrations + seeds) must match the
// static catalog it replaces, and the store filters must give the same results.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { categories } from "../src/data/categories.ts";
import { products, themes } from "../src/data/products.ts";
import { defaultFilters, filterProducts, isOutOfStock } from "../src/lib/catalog.ts";
import { listStorefrontCategories, listStorefrontProducts } from "../src/server/catalog/postgres-storefront.ts";

const dbDir = join(import.meta.dirname, "..", "db");
const sqlFiles = (folder) =>
  readdirSync(join(dbDir, folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dbDir, folder, name), "utf8"));

const withoutStock = (product) => {
  const copy = { ...product };
  delete copy.stock;
  delete copy.categoryLabel;
  return copy;
};

describe("storefront catalog read from PostgreSQL (PGlite)", () => {
  let db;
  let query;
  let catalog;

  before(async () => {
    db = new PGlite();
    for (const sql of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(sql);
    query = { query: async (text, params) => (await db.query(text, params)).rows };
    catalog = await listStorefrontProducts(query);
  });
  after(() => db.close());

  it("returns exactly the static catalog, in the same order", () => {
    assert.equal(catalog.length, products.length);
    assert.deepEqual(catalog.map(withoutStock), products);
  });

  it("returns the static categories in the same order, and each product's category name", async () => {
    assert.deepEqual(await listStorefrontCategories(query), categories);
    for (const product of catalog) {
      assert.equal(product.categoryLabel, categories.find((category) => category.id === product.category).label);
    }
  });

  it("adds stock: seeded units for tracked products, null for made-to-order ones", () => {
    for (const product of catalog) {
      assert.equal(product.stock, product.requiresQuote ? null : 20, product.id);
    }
  });

  const cases = [
    ["default", {}],
    ["search by name", { query: "gato" }],
    ["search by catalog code", { query: "088" }],
    ["by category", { category: "stickers" }],
    ["by theme", { theme: "argentina" }],
    ["custom products", { type: "personalizado" }],
    ["price ascending", { sort: "precio-asc" }],
    ["name descending", { sort: "nombre-desc" }],
  ];
  for (const [label, patch] of cases) {
    it(`filters give the same result as the static catalog: ${label}`, () => {
      const filters = { ...defaultFilters, ...patch };
      assert.deepEqual(
        filterProducts(catalog, filters).map((product) => product.id),
        filterProducts(products, filters).map((product) => product.id),
      );
    });
  }

  it("hides drafts and reflects price and stock changes", async () => {
    const [sticker] = catalog.filter((product) => product.code);
    await db.exec(`UPDATE products SET status = 'draft' WHERE legacy_id = '${sticker.id}'`);
    const other = catalog.find((product) => !product.requiresQuote && product.id !== sticker.id);
    await db.exec(`UPDATE product_variants SET price_minor = 123450 WHERE sku = 'SUB-${other.id.toUpperCase()}'`);
    await db.exec(
      `UPDATE inventory SET on_hand = 3, reserved = 3 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku = 'SUB-${other.id.toUpperCase()}'`,
    );

    const next = await listStorefrontProducts(query);
    assert.equal(next.some((product) => product.id === sticker.id), false, "draft is hidden");
    const changed = next.find((product) => product.id === other.id);
    assert.equal(changed.price, 1234.5);
    assert.equal(isOutOfStock(changed), true, "reserved units are not available");
  });

  it("falls back to the category image for products without photos", async () => {
    const target = catalog.find((product) => product.category === "dtf");
    await db.exec(`DELETE FROM product_images WHERE product_id = (SELECT id FROM products WHERE legacy_id = '${target.id}')`);
    const product = (await listStorefrontProducts(query)).find((item) => item.id === target.id);
    assert.equal(product.images.length, 1);
    assert.equal(product.images[0].src, categories.find((category) => category.id === "dtf").image);
  });

  it("only stores themes the store knows", () => {
    for (const product of catalog) assert.ok(product.theme in themes, product.id);
  });
});
