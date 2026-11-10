// Variants end to end: store catalog, browser cart, server quote and admin API.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { addLine, parseCart, removeLine, setQuantity, summarizeCart } from "../src/lib/cart.ts";
import { createVariantRepository } from "../src/server/admin/variants-repository.ts";
import { handleAdminApi } from "../src/server/api/handler.ts";
import { createApiKeyRepository } from "../src/server/api/keys.ts";
import { quoteCart } from "../src/server/cart/quote.ts";
import { parseQuoteRequest } from "../src/server/cart/validation.ts";
import { createPostgresCatalogRepository } from "../src/server/catalog/postgres-repository.ts";
import { listStorefrontProducts } from "../src/server/catalog/postgres-storefront.ts";
import { createPostgresInventoryRepository } from "../src/server/inventory/postgres-repository.ts";

const dbDir = join(import.meta.dirname, "..", "db");
const sqlFiles = (folder) =>
  readdirSync(join(dbDir, folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dbDir, folder, name), "utf8"));

const admin = { authUserId: "auth-admin", email: "admin@example.com", role: "owner" };

describe("browser cart with variants", () => {
  const remera = {
    id: "p13",
    name: "Remera",
    price: 18500,
    availableForDirectPurchase: true,
    optionNames: ["Talle"],
    variants: [
      { sku: "SUB-P13", options: { Talle: "S" }, price: 18500, stock: 3 },
      { sku: "SUB-P13-XL", options: { Talle: "XL" }, price: 21500, stock: 0 },
    ],
  };
  const sticker = { id: "c088", name: "Sticker", price: 1500, availableForDirectPurchase: true };

  it("keeps one line per variant and resolves each price", () => {
    let lines = addLine([], "p13", 1, "SUB-P13");
    lines = addLine(lines, "p13", 2, "SUB-P13-XL");
    lines = addLine(lines, "p13", 1, "SUB-P13");
    lines = addLine(lines, "c088", 3);
    assert.deepEqual(lines, [
      { productId: "p13", quantity: 2, sku: "SUB-P13" },
      { productId: "p13", quantity: 2, sku: "SUB-P13-XL" },
      { productId: "c088", quantity: 3 },
    ]);
    const summary = summarizeCart(lines, [remera, sticker]);
    assert.deepEqual(
      summary.items.map((item) => [item.optionsLabel ?? "", item.unitPrice, item.stock ?? null]),
      [
        ["Talle S", 18500, 3],
        ["Talle XL", 21500, 0],
        ["", 1500, null],
      ],
    );
    assert.equal(summary.subtotal, 2 * 18500 + 2 * 21500 + 3 * 1500);
    lines = setQuantity(lines, "p13", 5, "SUB-P13-XL");
    lines = removeLine(lines, "p13", "SUB-P13");
    assert.deepEqual(lines.map((line) => [line.sku ?? "", line.quantity]), [["SUB-P13-XL", 5], ["", 3]]);
  });

  it("drops lines of products with options that do not name a known variant", () => {
    const summary = summarizeCart([{ productId: "p13", quantity: 1 }, { productId: "p13", quantity: 1, sku: "OTRO" }], [remera]);
    assert.equal(summary.items.length, 0);
  });

  it("restores saved carts with their SKUs", () => {
    assert.deepEqual(parseCart('[{"productId":"p13","quantity":2,"sku":"SUB-P13"},{"productId":"x","quantity":1,"sku":7}]'), [
      { productId: "p13", quantity: 2, sku: "SUB-P13" },
    ]);
  });
});

describe("variants across the store, the quote and the API (PGlite)", () => {
  let db;
  let query;
  let token;
  const call = async (method, path, body) => {
    const init = { method, headers: { authorization: `Bearer ${token}` } };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers["content-type"] = "application/json";
    }
    const response = await handleAdminApi(new Request(`https://sublime.test/api/admin/v1/${path}`, init), path.split("?")[0].split("/"), {
      sql: query,
      available: true,
    });
    return { status: response.status, body: await response.json() };
  };

  before(async () => {
    db = new PGlite();
    for (const sql of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(sql);
    query = { query: async (text, params) => (await db.query(text, params)).rows };
    token = (await createApiKeyRepository(query).createKey(admin, "n8n", ["catalog:read", "catalog:write", "prices:write", "stock:write"])).token;
  });
  after(() => db.close());

  it("defines sizes through the API and lists the variants", async () => {
    const response = await call("PUT", "products/SUB-P13/options", { options: [{ name: "Talle", values: ["S", "M", "XL"] }] });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.optionNames, ["Talle"]);
    assert.deepEqual(response.body.variants.map((variant) => variant.sku), ["SUB-P13", "SUB-P13-M", "SUB-P13-XL"]);
    const detail = await call("GET", "products/SUB-P13-M");
    assert.equal(detail.body.variants.length, 3, "a variant SKU finds its product");
  });

  it("sets price and stock per variant SKU, and refuses a product-level price", async () => {
    const prices = await call("POST", "prices/bulk-update", { items: [{ sku: "SUB-P13-XL", priceMinor: 2_150_000 }] });
    assert.deepEqual(prices.body.summary.updated, 1);
    const stock = await call("POST", "stock/bulk-count", { items: [{ sku: "SUB-P13-M", onHand: 4, reason: "restock" }] });
    assert.deepEqual([stock.body.items[0].before, stock.body.items[0].after], [0, 4]);
    const ambiguous = await call("PATCH", "products/SUB-P13", { priceMinor: 1 });
    assert.equal(ambiguous.status, 422);
    assert.match(ambiguous.body.fields[0].message, /variantes/);
  });

  it("applies price rules to every variant", async () => {
    const rule = await call("POST", "prices/bulk-update", { rule: { type: "percent", value: 10 }, scope: { skus: ["SUB-P13"] }, dryRun: true });
    assert.deepEqual(rule.body.items.map((item) => item.sku), ["SUB-P13", "SUB-P13-M", "SUB-P13-XL"]);
  });

  it("shows the variants in the store with a 'from' price and summed stock", async () => {
    const remera = (await listStorefrontProducts(query)).find((product) => product.id === "p13");
    assert.deepEqual(remera.optionNames, ["Talle"]);
    assert.deepEqual(
      remera.variants.map((variant) => [variant.options.Talle, variant.price, variant.stock]),
      [
        ["S", 18500, 20],
        ["M", 18500, 4],
        ["XL", 21500, 0],
      ],
    );
    assert.equal(remera.price, 18500, "lowest variant price");
    assert.equal(remera.stock, 24);
  });

  it("hides inactive variants from the store", async () => {
    const variants = createVariantRepository(query);
    const xl = (await variants.listVariants("p13")).find((variant) => variant.sku === "SUB-P13-XL");
    await variants.updateVariant(admin, "p13", xl.id, { priceMinor: xl.priceMinor, active: false });
    const remera = (await listStorefrontProducts(query)).find((product) => product.id === "p13");
    assert.deepEqual(remera.variants.map((variant) => variant.sku), ["SUB-P13", "SUB-P13-M"]);
  });

  it("quotes variants by SKU and requires one for products with options", async () => {
    const deps = { catalog: createPostgresCatalogRepository(query), inventory: createPostgresInventoryRepository(query) };
    const parsed = parseQuoteRequest({
      lines: [
        { productId: "p13", sku: "SUB-P13-M", quantity: 5 },
        { productId: "p13", quantity: 1 },
        { productId: "p14", sku: "SUB-P13-M", quantity: 1 },
        { productId: "p14", quantity: 1 },
      ],
    });
    assert.equal(parsed.ok, true);
    const quote = await quoteCart(parsed.lines, deps);
    assert.deepEqual(quote.lines.map((line) => [line.sku, line.name, line.quantity]), [
      ["SUB-P13-M", "Remera Ruido Visual · Talle M", 4],
      ["SUB-P14", "Remera Otro Planeta", 1],
    ]);
    assert.deepEqual(quote.issues.map((issue) => issue.code).sort(), ["insufficient_stock", "unknown_product", "variant_required"]);
    assert.equal(parseQuoteRequest({ lines: [{ productId: "p13", sku: "mal sku", quantity: 1 }] }).ok, false);
  });
});
