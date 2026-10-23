// Integration tests against a real staging database. They only run through
// `npm run test:db` (which loads .env.local) and need DATABASE_URL; the regular
// `npm test` skips them. Read-only: they never write to the database.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { neon } from "@neondatabase/serverless";
import { products } from "../src/data/products.ts";
import { quoteCart } from "../src/server/cart/quote.ts";
import { createPostgresCatalogRepository } from "../src/server/catalog/postgres-repository.ts";
import { createStaticCatalogRepository } from "../src/server/catalog/repository.ts";
import { createPostgresInventoryRepository } from "../src/server/inventory/postgres-repository.ts";
import { createUntrackedInventoryRepository } from "../src/server/inventory/repository.ts";

const enabled = process.env.npm_lifecycle_event === "test:db" && Boolean(process.env.DATABASE_URL);

describe("Postgres repositories (staging)", { skip: !enabled && "run with npm run test:db and DATABASE_URL" }, () => {
  const sql = enabled ? neon(process.env.DATABASE_URL) : null;
  const catalog = enabled ? createPostgresCatalogRepository(sql) : null;
  const inventory = enabled ? createPostgresInventoryRepository(sql) : null;
  const staticCatalog = createStaticCatalogRepository(products);

  it("serves the same prices and rules as the static catalog", async () => {
    const ids = products.map((product) => product.id);
    const [fromDb, fromStatic] = await Promise.all([
      catalog.findVariantsByProductIds(ids),
      staticCatalog.findVariantsByProductIds(ids),
    ]);
    assert.equal(fromDb.size, fromStatic.size);
    for (const [id, expected] of fromStatic) {
      const actual = fromDb.get(id);
      assert.ok(actual, id);
      for (const key of ["sku", "unitPriceMinor", "currency", "purchasable", "requiresQuote", "trackStock", "active"]) {
        assert.deepEqual(actual[key], expected[key], `${id}.${key}`);
      }
    }
  });

  it("tracks stock for standard products and not for custom orders", async () => {
    const sticker = await inventory.getAvailability(["STK-088"]);
    assert.equal(typeof sticker.get("STK-088"), "number");
    const custom = (await catalog.findVariantsByProductIds(["p21"])).get("p21");
    assert.equal((await inventory.getAvailability([custom.sku])).get(custom.sku), null);
  });

  it("quotes the same totals from the database as from the static catalog", async () => {
    const lines = [
      { productId: "c088", quantity: 2 },
      { productId: "p13", quantity: 1 },
    ];
    const fromDb = await quoteCart(lines, { catalog, inventory });
    const fromStatic = await quoteCart(lines, { catalog: staticCatalog, inventory: createUntrackedInventoryRepository() });
    assert.equal(fromDb.subtotalMinor, fromStatic.subtotalMinor);
    assert.equal(fromDb.valid, true);
  });

  it("enforces stock integrity constraints in the database", async () => {
    const [{ violations }] = await sql`SELECT count(*)::int AS violations FROM inventory WHERE reserved > on_hand OR on_hand < 0`;
    assert.equal(violations, 0);
  });
});
