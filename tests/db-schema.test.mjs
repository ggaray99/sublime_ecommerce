// Runs the real migration and seed on an in-memory PostgreSQL (PGlite, WASM)
// to validate the SQL, its constraints and the Postgres repositories locally,
// without provisioning any database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { categories } from "../src/data/categories.ts";
import { products } from "../src/data/products.ts";
import { quoteCart } from "../src/server/cart/quote.ts";
import { buildImportPlan, renderSeedSql, STAGING_PLACEHOLDER_STOCK } from "../src/server/catalog/import-plan.ts";
import { createPostgresCatalogRepository } from "../src/server/catalog/postgres-repository.ts";
import { createStaticCatalogRepository } from "../src/server/catalog/repository.ts";
import { createPostgresInventoryRepository } from "../src/server/inventory/postgres-repository.ts";

const migration = readFileSync(join(import.meta.dirname, "..", "db", "migrations", "0001_catalog_inventory.sql"), "utf8");

let db;
/** Adapts PGlite to the subset of the Neon query function the repositories use. */
const sql = { query: async (text, params) => (await db.query(text, params)).rows };

const rejects = (statement) => assert.rejects(db.exec(statement), undefined, statement);

describe("0001 migration on PostgreSQL (PGlite)", () => {
  before(async () => {
    db = new PGlite();
    await db.exec(migration);
    await db.exec(renderSeedSql(buildImportPlan(categories, products)));
  });
  after(() => db.close());

  it("loads the whole catalog with stock for every standard product", async () => {
    const [{ products: total, tracked, untracked, stocked }] = (
      await db.query(`SELECT
        (SELECT count(*)::int FROM products) AS products,
        (SELECT count(*)::int FROM product_variants WHERE track_stock) AS tracked,
        (SELECT count(*)::int FROM product_variants WHERE NOT track_stock) AS untracked,
        (SELECT count(*)::int FROM inventory) AS stocked`)
    ).rows;
    assert.equal(total, products.length);
    assert.equal(untracked, products.filter((product) => product.requiresQuote).length);
    assert.equal(tracked, stocked);
  });

  it("records every initial count in the inventory ledger", async () => {
    const [{ mismatched }] = (
      await db.query(`SELECT count(*)::int AS mismatched FROM inventory i
        WHERE i.on_hand <> (SELECT coalesce(sum(m.delta_on_hand), 0) FROM inventory_movements m WHERE m.variant_id = i.variant_id)`)
    ).rows;
    assert.equal(mismatched, 0);
  });

  it("rejects negative stock, over-reservation, negative prices and duplicate SKUs", async () => {
    await rejects("UPDATE inventory SET on_hand = -1 WHERE true");
    await rejects("UPDATE inventory SET reserved = on_hand + 1 WHERE true");
    await rejects("UPDATE product_variants SET price_minor = -1 WHERE sku = 'STK-088'");
    await rejects("UPDATE product_variants SET sku = 'STK-088' WHERE sku = 'STK-090'");
    await rejects("UPDATE products SET slug = 'Con Espacios' WHERE legacy_id = 'c088'");
    await rejects(
      "INSERT INTO inventory_movements (variant_id, reason, actor) SELECT id, 'adjustment', 'test' FROM product_variants WHERE sku = 'STK-088'",
    );
  });

  it("keeps reservations consistent with their status", async () => {
    await rejects(
      "INSERT INTO stock_reservations (variant_id, quantity, expires_at, idempotency_key) SELECT id, 0, now(), 'reserva-0001' FROM product_variants WHERE sku = 'STK-088'",
    );
    await rejects(
      "INSERT INTO stock_reservations (variant_id, quantity, status, expires_at, idempotency_key) SELECT id, 1, 'released', now(), 'reserva-0002' FROM product_variants WHERE sku = 'STK-088'",
    );
  });

  it("serves the same catalog through the Postgres repository as the static one", async () => {
    const ids = products.map((product) => product.id);
    const fromDb = await createPostgresCatalogRepository(sql).findVariantsByProductIds(ids);
    const fromStatic = await createStaticCatalogRepository(products).findVariantsByProductIds(ids);
    assert.equal(fromDb.size, products.length);
    const fields = ["sku", "unitPriceMinor", "currency", "purchasable", "requiresQuote", "trackStock", "active"];
    for (const [id, expected] of fromStatic) {
      for (const key of fields) assert.deepEqual(fromDb.get(id)[key], expected[key], `${id}.${key}`);
    }
  });

  it("computes availability as on_hand minus reserved, null for made-to-order", async () => {
    await db.exec("UPDATE inventory SET reserved = 5 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku = 'STK-088'");
    const availability = await createPostgresInventoryRepository(sql).getAvailability(["STK-088", "SUB-P21", "STK-090"]);
    assert.equal(availability.get("STK-088"), STAGING_PLACEHOLDER_STOCK - 5);
    assert.equal(availability.get("STK-090"), STAGING_PLACEHOLDER_STOCK);
    assert.equal(availability.get("SUB-P21"), null);
  });

  it("limits a quote to the stock stored in the database", async () => {
    const deps = { catalog: createPostgresCatalogRepository(sql), inventory: createPostgresInventoryRepository(sql) };
    const quote = await quoteCart([{ productId: "c088", quantity: 50 }], deps);
    assert.equal(quote.lines[0].quantity, STAGING_PLACEHOLDER_STOCK - 5);
    assert.equal(quote.issues[0].code, "insufficient_stock");
    assert.equal(quote.valid, false);
  });

  it("treats a tracked variant without an inventory row as out of stock", async () => {
    await db.exec("DELETE FROM inventory_movements WHERE variant_id IN (SELECT id FROM product_variants WHERE sku = 'STK-090')");
    await db.exec("DELETE FROM inventory WHERE variant_id IN (SELECT id FROM product_variants WHERE sku = 'STK-090')");
    const availability = await createPostgresInventoryRepository(sql).getAvailability(["STK-090"]);
    assert.equal(availability.get("STK-090"), 0);
  });
});
