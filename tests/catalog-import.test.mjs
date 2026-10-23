import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { categories } from "../src/data/categories.ts";
import { products } from "../src/data/products.ts";
import { buildImportPlan, renderSeedSql } from "../src/server/catalog/import-plan.ts";

const plan = buildImportPlan(categories, products);

describe("catalog import rehearsal", () => {
  it("maps the whole static catalog without constraint violations", () => {
    assert.deepEqual(plan.errors, []);
    assert.equal(plan.categories.length, categories.length);
    assert.equal(plan.products.length, products.length);
    assert.equal(plan.variants.length, products.length);
    assert.equal(plan.images.length, products.reduce((total, product) => total + product.images.length, 0));
  });

  it("keeps catalog codes as SKUs and prices in centavos", () => {
    const sticker = plan.variants.find((variant) => variant.product_legacy_id === "c088");
    assert.equal(sticker.sku, "STK-088");
    assert.equal(sticker.price_minor, 180000);
    const custom = plan.variants.find((variant) => variant.product_legacy_id === "p21");
    assert.equal(custom.price_minor, null);
  });

  it("detects duplicates and invalid values before touching a database", () => {
    const broken = [
      ...products.slice(0, 2),
      { ...products[0], id: "x1" },
      { ...products[1], id: "x2", slug: "Slug Inválido", price: null, requiresQuote: false },
    ];
    const errors = buildImportPlan(categories, broken).errors.join("\n");
    assert.match(errors, /slug duplicado/);
    assert.match(errors, /slug inválido/);
    assert.match(errors, /sin precio y sin cotización/);
  });

  it("renders a transactional seed that escapes quotes", () => {
    const sql = renderSeedSql(
      buildImportPlan(categories, [{ ...products.find((product) => product.id === "c088"), name: "Sticker D'Artagnan" }]),
    );
    assert.match(sql, /^-- Generated/);
    assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
    assert.match(sql, /'Sticker D''Artagnan'/);
  });

  it("matches every table and column referenced by the 0001 migration", () => {
    const migration = readFileSync(join(import.meta.dirname, "..", "db", "migrations", "0001_catalog_inventory.sql"), "utf8");
    const seed = renderSeedSql(plan);
    for (const [, table, columns] of seed.matchAll(/INSERT INTO (\w+) \(([^)]+)\)/g)) {
      const definition = migration.match(new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\);`));
      assert.ok(definition, `table ${table} missing in migration`);
      for (const column of columns.split(",").map((name) => name.trim())) {
        assert.match(definition[1], new RegExp(`^\\s+${column}\\s`, "m"), `${table}.${column} missing in migration`);
      }
    }
  });
});
