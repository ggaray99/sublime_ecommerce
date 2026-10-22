import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { products } from "../src/data/products.ts";
import { MAX_QUANTITY, addLine, parseCart, removeLine, setQuantity, summarizeCart } from "../src/lib/cart.ts";
import { formatPrice, priceLabel } from "../src/lib/format.ts";
import { MAX_FILE_BYTES, validateQuote } from "../src/lib/quote.ts";

describe("formatPrice", () => {
  it("uses the Argentine format", () => {
    assert.equal(formatPrice(2500), "$ 2.500");
    assert.equal(formatPrice(18900), "$ 18.900");
    assert.equal(formatPrice(1234567), "$ 1.234.567");
    assert.equal(formatPrice(0), "$ 0");
  });

  it("labels quoted products", () => {
    assert.equal(priceLabel(null), "A presupuestar");
  });
});

describe("cart operations", () => {
  it("adds new lines and accumulates existing ones", () => {
    let lines = addLine([], "p01");
    lines = addLine(lines, "p01", 2);
    lines = addLine(lines, "p02");
    assert.deepEqual(lines, [
      { productId: "p01", quantity: 3 },
      { productId: "p02", quantity: 1 },
    ]);
  });

  it("clamps quantities between 1 and the maximum", () => {
    const lines = [{ productId: "p01", quantity: 2 }];
    assert.equal(setQuantity(lines, "p01", 0)[0].quantity, 1);
    assert.equal(setQuantity(lines, "p01", 500)[0].quantity, MAX_QUANTITY);
    assert.equal(addLine(lines, "p01", 500)[0].quantity, MAX_QUANTITY);
    assert.equal(setQuantity(lines, "p01", Number.NaN)[0].quantity, 2);
  });

  it("removes lines", () => {
    assert.deepEqual(removeLine([{ productId: "p01", quantity: 1 }], "p01"), []);
  });

  it("parses persisted data defensively", () => {
    assert.deepEqual(parseCart(null), []);
    assert.deepEqual(parseCart("not json"), []);
    assert.deepEqual(parseCart('{"productId":"p01"}'), []);
    assert.deepEqual(parseCart('[{"productId":"p01","quantity":2},{"productId":3},{"quantity":1}]'), [
      { productId: "p01", quantity: 2 },
    ]);
  });

  it("summarizes totals and skips unknown or quote-only products", () => {
    const summary = summarizeCart(
      [
        { productId: "p01", quantity: 2 },
        { productId: "p13", quantity: 1 },
        { productId: "p21", quantity: 5 },
        { productId: "missing", quantity: 1 },
      ],
      products,
    );
    const sticker = products.find((product) => product.id === "p01");
    const shirt = products.find((product) => product.id === "p13");
    assert.equal(summary.items.length, 2);
    assert.equal(summary.count, 3);
    assert.equal(summary.subtotal, sticker.price * 2 + shirt.price);
  });
});

describe("validateQuote", () => {
  const valid = {
    name: "Ana",
    email: "ana@example.com",
    productType: "Stickers troquelados",
    quantity: "50",
    idea: "Stickers redondos con el logo de mi banda en violeta.",
    reference: "",
    file: null,
  };

  it("accepts a complete request", () => {
    assert.deepEqual(validateQuote(valid), {});
  });

  it("reports every missing required field", () => {
    const errors = validateQuote({ ...valid, name: "", email: "", productType: "", quantity: "", idea: "" });
    assert.deepEqual(Object.keys(errors).sort(), ["email", "idea", "name", "productType", "quantity"]);
  });

  it("validates email, quantity and idea length", () => {
    assert.ok(validateQuote({ ...valid, email: "ana@" }).email);
    assert.ok(validateQuote({ ...valid, quantity: "2.5" }).quantity);
    assert.ok(validateQuote({ ...valid, quantity: "-3" }).quantity);
    assert.ok(validateQuote({ ...valid, idea: "corto" }).idea);
    assert.ok(validateQuote({ ...valid, productType: "Algo inventado" }).productType);
  });

  it("validates optional reference files", () => {
    assert.deepEqual(validateQuote({ ...valid, file: { name: "ref.png", size: 1000, type: "image/png" } }), {});
    assert.ok(validateQuote({ ...valid, file: { name: "x.exe", size: 1000, type: "application/x-msdownload" } }).file);
    assert.ok(validateQuote({ ...valid, file: { name: "big.pdf", size: MAX_FILE_BYTES + 1, type: "application/pdf" } }).file);
  });
});
