// Product extras: sale prices (display = charge), weight/dimensions/cost/stock alert, over PGlite.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { effectivePriceMinor, NO_SALE, saleActive } from "../src/lib/pricing.ts";
import { argentinaDateTime, createProductExtrasRepository, parseProductExtras, toArgentinaInput } from "../src/server/admin/product-extras.ts";
import { createPostgresCatalogRepository } from "../src/server/catalog/postgres-repository.ts";
import { listStorefrontProducts } from "../src/server/catalog/postgres-storefront.ts";

const sql = (folder) =>
  readdirSync(join("db", folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join("db", folder, name), "utf8"));

describe("sale price rule", () => {
  const now = new Date("2026-11-01T12:00:00-03:00");
  it("applies a percentage rounded to whole pesos, or a fixed price never above the regular one", () => {
    assert.equal(effectivePriceMinor(1_000_110, { ...NO_SALE, percent: 10 }, now), 900_100);
    assert.equal(effectivePriceMinor(250_000, { ...NO_SALE, priceMinor: 199_900 }, now), 199_900);
    assert.equal(effectivePriceMinor(150_000, { ...NO_SALE, priceMinor: 199_900 }, now), 150_000);
    assert.equal(effectivePriceMinor(250_000, NO_SALE, now), 250_000);
  });

  it("respects the dates", () => {
    const sale = { ...NO_SALE, percent: 20, startsAt: new Date("2026-11-02T00:00:00-03:00"), endsAt: new Date("2026-11-05T00:00:00-03:00") };
    assert.equal(saleActive(sale, now), false, "not started");
    assert.equal(saleActive(sale, new Date("2026-11-03T10:00:00-03:00")), true);
    assert.equal(saleActive(sale, new Date("2026-11-05T00:00:00-03:00")), false, "ended");
  });
});

describe("parseProductExtras", () => {
  it("converts centimetres, pesos and Argentina times", () => {
    const parsed = parseProductExtras(
      { weightG: "180", length: "30", width: "25,5", height: "2", cost: "1.700", lowStockThreshold: "3", saleKind: "percent", salePercent: "15", saleStartsAt: "2026-11-01T00:00", saleEndsAt: "2026-11-03T23:59" },
      { hasOptions: false },
    );
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value.widthMm, 255);
    assert.equal(parsed.value.costMinor, 170_000);
    assert.equal(parsed.value.saleStartsAt.toISOString(), "2026-11-01T03:00:00.000Z");
    assert.equal(toArgentinaInput(parsed.value.saleStartsAt), "2026-11-01T00:00");
  });

  it("rejects invalid values and fixed sale prices on products with variants", () => {
    const parsed = parseProductExtras(
      { weightG: "-1", length: "abc", cost: "mucho", lowStockThreshold: "1.5", saleKind: "price", salePrice: "1500", saleStartsAt: "2026-11-05T00:00", saleEndsAt: "2026-11-01T00:00" },
      { hasOptions: true },
    );
    assert.equal(parsed.ok, false);
    assert.deepEqual(Object.keys(parsed.errors).sort(), ["cost", "length", "lowStockThreshold", "saleEndsAt", "salePrice", "weightG"]);
    assert.equal(argentinaDateTime("ayer"), undefined);
  });

  it("drops the dates when there is no sale", () => {
    const parsed = parseProductExtras({ saleKind: "none", saleStartsAt: "2026-11-01T00:00" }, { hasOptions: false });
    assert.equal(parsed.value.saleStartsAt, null);
  });
});

describe("extras over PostgreSQL (PGlite)", () => {
  let db;
  let query;
  before(async () => {
    db = new PGlite();
    for (const text of [...sql("migrations"), ...sql("seed")]) await db.exec(text);
    query = { query: async (text, params) => (await db.query(text, params)).rows };
  });
  after(() => db.close());

  it("saves, reads back and audits; the cart and the store both use the sale price", async () => {
    const [{ legacy_id: id, sku, price_minor: regular }] = (
      await db.query(
        "SELECT p.legacy_id, v.sku, v.price_minor FROM products p JOIN product_variants v ON v.product_id = p.id AND v.is_default WHERE p.status = 'active' AND NOT p.requires_quote AND p.option_names = '{}' ORDER BY p.legacy_id LIMIT 1",
      )
    ).rows;
    const repo = createProductExtrasRepository(query);
    const extras = { weightG: 20, lengthMm: 50, widthMm: 50, heightMm: 2, costMinor: 30_000, lowStockThreshold: 4, salePercent: 25, salePriceMinor: null, saleStartsAt: null, saleEndsAt: null };
    assert.equal(await repo.save({ authUserId: "a", email: "a@example.com" }, id, extras), true);
    assert.deepEqual(await repo.get(id), extras);

    const expected = effectivePriceMinor(Number(regular), { ...NO_SALE, percent: 25 });
    const variant = (await createPostgresCatalogRepository(query).findVariantsBySkus([sku])).get(sku);
    assert.equal(variant.unitPriceMinor, expected, "charged price");
    assert.equal(variant.regularPriceMinor, Number(regular));

    const product = (await listStorefrontProducts(query)).find((p) => p.id === id);
    assert.equal(product.price * 100, expected, "shown price");
    assert.equal(product.regularPrice * 100, Number(regular));

    const { rows } = await db.query("SELECT action FROM audit_logs WHERE entity_id = $1", [id]);
    assert.ok(rows.some((r) => r.action === "product.extras"));
  });

  it("the database refuses a percentage and a fixed price at once", async () => {
    await assert.rejects(db.query("UPDATE products SET sale_percent = 10, sale_price_minor = 100 WHERE legacy_id = (SELECT legacy_id FROM products LIMIT 1)"));
  });
});
