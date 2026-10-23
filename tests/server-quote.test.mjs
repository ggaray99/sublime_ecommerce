import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { products } from "../src/data/products.ts";
import { createStaticCatalogRepository } from "../src/server/catalog/repository.ts";
import { handleCartQuote, MAX_BODY_BYTES } from "../src/server/cart/handler.ts";
import { MAX_LINE_QUANTITY, quoteCart } from "../src/server/cart/quote.ts";
import { parseQuoteRequest } from "../src/server/cart/validation.ts";
import {
  createFixedInventoryRepository,
  createUntrackedInventoryRepository,
} from "../src/server/inventory/repository.ts";

const catalog = createStaticCatalogRepository(products);
const deps = { catalog, inventory: createUntrackedInventoryRepository() };
const sticker = products.find((product) => product.id === "c088");
const shirt = products.find((product) => product.id === "p13");
const custom = products.find((product) => product.requiresQuote);

describe("quoteCart (server-side recalculation)", () => {
  it("prices lines from the catalog in centavos", async () => {
    const quote = await quoteCart(
      [
        { productId: "c088", quantity: 3 },
        { productId: "p13", quantity: 1 },
      ],
      deps,
    );
    assert.equal(quote.valid, true);
    assert.equal(quote.currency, "ARS");
    assert.deepEqual(
      quote.lines.map((line) => [line.sku, line.unitPriceMinor, line.lineTotalMinor]),
      [
        ["STK-088", sticker.price * 100, sticker.price * 300],
        ["SUB-P13", shirt.price * 100, shirt.price * 100],
      ],
    );
    assert.equal(quote.subtotalMinor, sticker.price * 300 + shirt.price * 100);
    assert.deepEqual(quote.shipping, { status: "pending" });
  });

  it("merges duplicate lines for the same product", async () => {
    const quote = await quoteCart(
      [
        { productId: "c088", quantity: 2 },
        { productId: "c088", quantity: 3 },
      ],
      deps,
    );
    assert.equal(quote.lines.length, 1);
    assert.equal(quote.lines[0].quantity, 5);
  });

  it("reports unknown and quote-only products without pricing them", async () => {
    const quote = await quoteCart(
      [
        { productId: "nope", quantity: 1 },
        { productId: custom.id, quantity: 1 },
      ],
      deps,
    );
    assert.equal(quote.valid, false);
    assert.equal(quote.lines.length, 0);
    assert.deepEqual(
      quote.issues.map((issue) => [issue.productId, issue.code]),
      [
        ["nope", "unknown_product"],
        [custom.id, "requires_quote"],
      ],
    );
    assert.equal(quote.subtotalMinor, 0);
  });

  it("limits quantities to tracked stock and flags the shortfall", async () => {
    const quote = await quoteCart([{ productId: "c088", quantity: 5 }], {
      catalog,
      inventory: createFixedInventoryRepository({ "STK-088": 2 }),
    });
    assert.equal(quote.valid, false);
    assert.equal(quote.lines[0].quantity, 2);
    assert.equal(quote.lines[0].available, 2);
    assert.equal(quote.issues[0].code, "insufficient_stock");
  });

  it("drops lines with no stock at all", async () => {
    const quote = await quoteCart([{ productId: "c088", quantity: 1 }], {
      catalog,
      inventory: createFixedInventoryRepository({ "STK-088": 0 }),
    });
    assert.equal(quote.lines.length, 0);
    assert.equal(quote.issues[0].message, "Sin stock disponible.");
  });

  it("caps merged quantities and marks the quote invalid", async () => {
    const quote = await quoteCart(
      [
        { productId: "c088", quantity: MAX_LINE_QUANTITY },
        { productId: "c088", quantity: 5 },
      ],
      deps,
    );
    assert.equal(quote.lines[0].quantity, MAX_LINE_QUANTITY);
    assert.equal(quote.valid, false);
  });
});

describe("parseQuoteRequest", () => {
  it("accepts a well-formed body", () => {
    assert.deepEqual(parseQuoteRequest({ lines: [{ productId: "c088", quantity: 2 }] }), {
      ok: true,
      lines: [{ productId: "c088", quantity: 2 }],
    });
  });

  it("rejects client-supplied prices and unknown fields", () => {
    const result = parseQuoteRequest({ lines: [{ productId: "c088", quantity: 1, price: 1 }], total: 1 });
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors.map((error) => error.path).sort(), ["lines[0].price", "total"]);
  });

  it("rejects invalid quantities, ids and shapes", () => {
    for (const body of [
      null,
      [],
      { lines: "x" },
      { lines: [] },
      { lines: [{ productId: "c088", quantity: 0 }] },
      { lines: [{ productId: "c088", quantity: 1.5 }] },
      { lines: [{ productId: "c088", quantity: MAX_LINE_QUANTITY + 1 }] },
      { lines: [{ productId: "../etc", quantity: 1 }] },
      { lines: [{ productId: 7, quantity: 1 }] },
      { lines: Array.from({ length: 51 }, () => ({ productId: "c088", quantity: 1 })) },
    ]) {
      assert.equal(parseQuoteRequest(body).ok, false, JSON.stringify(body)?.slice(0, 60));
    }
  });
});

describe("POST /api/cart/quote handler", () => {
  const post = (body, headers = { "content-type": "application/json" }) =>
    handleCartQuote(
      new Request("http://localhost/api/cart/quote", {
        method: "POST",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
      deps,
    );

  it("returns a server-computed quote", async () => {
    const response = await post({ lines: [{ productId: "c088", quantity: 2 }] });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.subtotalMinor, sticker.price * 200);
  });

  it("rejects non-JSON content types", async () => {
    assert.equal((await post("lines=1", { "content-type": "application/x-www-form-urlencoded" })).status, 415);
  });

  it("rejects malformed JSON", async () => {
    assert.equal((await post("{not json")).status, 400);
  });

  it("returns field errors for invalid input", async () => {
    const response = await post({ lines: [{ productId: "c088", quantity: -1 }] });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.fields[0].path, "lines[0].quantity");
  });

  it("rejects oversized bodies", async () => {
    const response = await post(JSON.stringify({ lines: [], padding: "x".repeat(MAX_BODY_BYTES) }));
    assert.equal(response.status, 413);
  });
});
