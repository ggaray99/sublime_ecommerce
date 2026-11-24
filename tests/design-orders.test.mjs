// Design lines across the cart, the server quote and the order (PGlite with the full schema and seeds).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { addLine, parseCart, removeLine, setQuantity } from "../src/lib/cart.ts";
import { quoteCart } from "../src/server/cart/quote.ts";
import { parseQuoteRequest } from "../src/server/cart/validation.ts";
import { createPostgresCatalogRepository } from "../src/server/catalog/postgres-repository.ts";
import { createDesignRepository } from "../src/server/designs/repository.ts";
import { createPostgresDesignOffers, noDesignOffers } from "../src/server/designs/offers.ts";
import { createPostgresInventoryRepository } from "../src/server/inventory/postgres-repository.ts";
import { checkout, parseCheckout } from "../src/server/orders/checkout.ts";
import { createOrderRepository } from "../src/server/orders/repository.ts";
import { createShippingRepository } from "../src/server/shipping/repository.ts";

const dbDir = join(import.meta.dirname, "..", "db");
const sqlFiles = (folder) =>
  readdirSync(join(dbDir, folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dbDir, folder, name), "utf8"));

const DESIGN = "0f8e4a52-6d1b-4c3e-9a7f-2b5c8d9e0a11";
const OTHER = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

describe("cart lines with a design (browser)", () => {
  it("keeps designId and tolerates old saved lines without it", () => {
    const raw = JSON.stringify([
      { productId: "p08", quantity: 2 },
      { productId: "p08", quantity: 1, designId: DESIGN },
      { productId: "p08", quantity: 1, designId: "not-a-uuid" },
      { productId: "p08", quantity: 1, designId: 7 },
    ]);
    assert.deepEqual(parseCart(raw), [
      { productId: "p08", quantity: 2 },
      { productId: "p08", quantity: 1, designId: DESIGN },
    ]);
  });

  it("treats the same product with and without a design as two lines", () => {
    let lines = addLine([], "p08", 1);
    lines = addLine(lines, "p08", 2, undefined, DESIGN);
    lines = addLine(lines, "p08", 1, undefined, DESIGN);
    lines = addLine(lines, "p08", 1, undefined, OTHER);
    assert.deepEqual(lines, [
      { productId: "p08", quantity: 1 },
      { productId: "p08", quantity: 3, designId: DESIGN },
      { productId: "p08", quantity: 1, designId: OTHER },
    ]);
    lines = setQuantity(lines, "p08", 5, undefined, DESIGN);
    assert.equal(lines[1].quantity, 5);
    assert.equal(lines[0].quantity, 1);
    lines = removeLine(lines, "p08", undefined, DESIGN);
    assert.deepEqual(lines, [
      { productId: "p08", quantity: 1 },
      { productId: "p08", quantity: 1, designId: OTHER },
    ]);
  });
});

describe("quote request with a design", () => {
  it("accepts a lowercase uuid designId", () => {
    assert.deepEqual(parseQuoteRequest({ lines: [{ productId: "p08", quantity: 1, designId: DESIGN }] }), {
      ok: true,
      lines: [{ productId: "p08", quantity: 1, designId: DESIGN }],
    });
  });

  it("rejects malformed designs and still rejects unknown keys", () => {
    const result = parseQuoteRequest({ lines: [{ productId: "p08", quantity: 1, designId: DESIGN.toUpperCase(), designName: "Gratis" }] });
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors.map((error) => [error.path, error.message]).sort(), [
      ["lines[0].designId", "Diseño inválido."],
      ["lines[0].designName", "Campo no admitido."],
    ]);
  });

  it("the static catalog offers no designs: a design line is rejected", async () => {
    const { createStaticCatalogRepository } = await import("../src/server/catalog/repository.ts");
    const { createUntrackedInventoryRepository } = await import("../src/server/inventory/repository.ts");
    const { products } = await import("../src/data/products.ts");
    const product = products.find((candidate) => candidate.availableForDirectPurchase && candidate.price !== null && !candidate.variants);
    const quote = await quoteCart([{ productId: product.id, quantity: 1, designId: DESIGN }], {
      catalog: createStaticCatalogRepository(products),
      inventory: createUntrackedInventoryRepository(),
      designs: noDesignOffers,
    });
    assert.equal(quote.valid, false);
    assert.deepEqual(quote.issues, [
      { productId: product.id, designId: DESIGN, code: "design_unavailable", message: "Este diseño ya no está disponible en ese producto." },
    ]);
  });
});

describe("design lines on PostgreSQL (PGlite)", () => {
  const admin = { authUserId: "auth-admin", email: "admin@example.com", role: "owner" };
  const image = { imageUrl: "/media/disenos/gato.webp", sourcePath: "disenos/gato.png", width: 3000, height: 3000, opaque: false };
  let db;
  let deps;
  let orders;
  let published;
  let draft;
  const stock = async (sku) =>
    (await db.query("SELECT i.on_hand, i.reserved FROM inventory i JOIN product_variants v ON v.id = i.variant_id WHERE v.sku = $1", [sku])).rows[0];
  const contact = { contactName: "Ana Pérez", contactEmail: "ana@example.com", contactPhone: "", delivery: { method: "pickup" }, notes: "" };
  let keyCounter = 0;
  const key = () => `test-design-${++keyCounter}-key`;

  before(async () => {
    db = new PGlite();
    for (const sql of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(sql);
    const query = { query: async (text, params) => (await db.query(text, params)).rows };
    const designs = createDesignRepository(query);
    await designs.setMockupBase(admin, "tshirt", "p08");
    await designs.setMockupBase(admin, "mug", "p09");
    published = await designs.createDesign(admin, { name: "Gato astronauta", slug: "gato-astronauta", description: "", categoryId: null, kinds: ["tshirt"] });
    await designs.setDesignImage(admin, published, image);
    await designs.setDesignStatus(admin, published, "published");
    draft = await designs.createDesign(admin, { name: "Borrador", slug: "borrador", description: "", categoryId: null, kinds: ["tshirt"] });
    orders = createOrderRepository(query);
    deps = {
      catalog: createPostgresCatalogRepository(query),
      inventory: createPostgresInventoryRepository(query),
      designs: createPostgresDesignOffers(query),
      orders,
      shipping: createShippingRepository(query),
    };
  });
  after(() => db.close());

  beforeEach(async () => {
    await db.exec("UPDATE inventory SET on_hand = 5, reserved = 0 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku IN ('SUB-P08', 'SUB-P09')");
  });

  it("quotes a design line at the base variant price with the combined name", async () => {
    const quote = await quoteCart([{ productId: "p08", quantity: 2, designId: published }], deps);
    assert.equal(quote.valid, true);
    assert.equal(quote.lines.length, 1);
    const [line] = quote.lines;
    assert.deepEqual(
      [line.productId, line.sku, line.name, line.unitPriceMinor, line.lineTotalMinor, line.designId, line.designName],
      ["p08", "SUB-P08", "Gato astronauta · Remera", 890000, 2 * 890000, published, "Gato astronauta"],
    );
    assert.equal(quote.subtotalMinor, 2 * 890000);
  });

  it("rejects a draft design, a design not offered on that product and an unknown design", async () => {
    const message = "Este diseño ya no está disponible en ese producto.";
    const quote = await quoteCart(
      [
        { productId: "p08", quantity: 1, designId: draft },
        { productId: "p09", quantity: 1, designId: published },
        { productId: "p08", quantity: 1, designId: OTHER },
      ],
      deps,
    );
    assert.equal(quote.valid, false);
    assert.equal(quote.lines.length, 0);
    assert.deepEqual(quote.issues, [
      { productId: "p08", designId: draft, code: "design_unavailable", message },
      { productId: "p09", designId: published, code: "design_unavailable", message },
      { productId: "p08", designId: OTHER, code: "design_unavailable", message },
    ]);
  });

  it("keeps the same product with and without a design as two lines, sharing its stock", async () => {
    const quote = await quoteCart(
      [
        { productId: "p08", quantity: 1 },
        { productId: "p08", quantity: 1, designId: published },
        { productId: "p08", quantity: 1 },
      ],
      deps,
    );
    assert.deepEqual(quote.lines.map((line) => [line.sku, line.quantity, line.designId]), [
      ["SUB-P08", 2, undefined],
      ["SUB-P08", 1, published],
    ]);
    assert.equal(quote.lines[1].name, "Gato astronauta · Remera");
    assert.notEqual(quote.lines[0].name, quote.lines[1].name);
    const short = await quoteCart([{ productId: "p08", quantity: 3 }, { productId: "p08", quantity: 3, designId: published }], deps);
    assert.equal(short.valid, false);
    assert.deepEqual(short.lines.map((line) => line.quantity), [3, 2]);
    assert.deepEqual(short.issues.map((issue) => [issue.code, issue.designId]), [["insufficient_stock", published]]);
  });

  it("checkout reads the design from the cart field and the order records it", async () => {
    const form = parseCheckout({
      idempotencyKey: key(),
      contactName: "Ana",
      contactEmail: "ana@example.com",
      contactPhone: "2615551234",
      deliveryMethod: "pickup",
      cart: JSON.stringify([{ productId: "p08", quantity: 2, designId: published }, { productId: "p08", quantity: 1 }]),
    });
    assert.equal(form.ok, true);
    const result = await checkout(form.value, null, deps);
    assert.equal(result.ok, true);
    const order = await orders.getOrder(result.order.id);
    const byQuantity = [...order.items].sort((x, y) => y.quantity - x.quantity);
    assert.deepEqual(
      byQuantity.map((item) => [item.sku, item.quantity, item.designId, item.designName]),
      [
        ["SUB-P08", 2, published, "Gato astronauta"],
        ["SUB-P08", 1, null, null],
      ],
    );
    assert.equal(byQuantity[0].name, "Gato astronauta · Remera");
    assert.notEqual(byQuantity[1].name, "Gato astronauta · Remera");
    const { rows } = await db.query("SELECT design_id, design_name FROM order_items WHERE order_id = $1 ORDER BY quantity DESC", [order.id]);
    assert.deepEqual(rows, [
      { design_id: published, design_name: "Gato astronauta" },
      { design_id: null, design_name: null },
    ]);
    // One reservation per variant with the summed quantity.
    assert.deepEqual(await stock("SUB-P08"), { on_hand: 5, reserved: 3 });
    const holds = await db.query("SELECT quantity FROM stock_reservations WHERE order_id = $1", [order.id]);
    assert.deepEqual(holds.rows, [{ quantity: 3 }]);
  });

  describe("garment colors", () => {
    const COLOR_MESSAGE = "Ese color no está disponible para este diseño.";
    let blackOnly;
    let mugDesign;

    before(async () => {
      const query = { query: async (text, params) => (await db.query(text, params)).rows };
      const designs = createDesignRepository(query);
      const [{ id: p08 }] = (await db.query("SELECT id FROM products WHERE legacy_id = 'p08'")).rows;
      for (const [sku, color] of [["SUB-P08-BLANCO", "Blanco"], ["SUB-P08-NEGRO", "Negro"]]) {
        await db.query("INSERT INTO product_variants (product_id, sku, options, price_minor) VALUES ($1, $2, $3, 890000)", [p08, sku, { Color: color }]);
      }
      blackOnly = await designs.createDesign(admin, { name: "Noche", slug: "noche", description: "", categoryId: null, kinds: ["tshirt"], colors: { tshirt: ["negro"] } });
      await designs.setDesignImage(admin, blackOnly, image);
      await designs.setDesignStatus(admin, blackOnly, "published");
      mugDesign = await designs.createDesign(admin, { name: "Taza feliz", slug: "taza-feliz", description: "", categoryId: null, kinds: ["mug"], colors: {} });
      await designs.setDesignImage(admin, mugDesign, image);
      await designs.setDesignStatus(admin, mugDesign, "published");
    });

    it("accepts an enabled color and rejects a color the design is not offered on", async () => {
      const quote = await quoteCart(
        [
          { productId: "p08", sku: "SUB-P08-NEGRO", quantity: 1, designId: blackOnly },
          { productId: "p08", sku: "SUB-P08-BLANCO", quantity: 1, designId: blackOnly },
        ],
        deps,
      );
      assert.equal(quote.valid, false);
      assert.deepEqual(quote.lines.map((line) => [line.sku, line.name, line.designId]), [["SUB-P08-NEGRO", "Noche · Remera", blackOnly]]);
      assert.deepEqual(quote.issues, [{ productId: "p08", sku: "SUB-P08-BLANCO", designId: blackOnly, code: "design_unavailable", message: COLOR_MESSAGE }]);
    });

    it("a design without saved colors is offered on every color", async () => {
      const quote = await quoteCart([{ productId: "p08", sku: "SUB-P08-BLANCO", quantity: 1, designId: published }], deps);
      assert.equal(quote.valid, true);
      assert.deepEqual(quote.lines.map((line) => [line.sku, line.designId]), [["SUB-P08-BLANCO", published]]);
    });

    it("a base product without active variants answers unknown_product, as before colors", async () => {
      await db.query("UPDATE product_variants SET active = false WHERE product_id = (SELECT id FROM products WHERE legacy_id = 'p08')");
      try {
        const quote = await quoteCart([{ productId: "p08", quantity: 1, designId: published }], deps);
        assert.equal(quote.valid, false);
        assert.deepEqual(
          quote.issues.map((issue) => [issue.productId, issue.code, issue.message]),
          [["p08", "unknown_product", "El producto no existe o no está disponible."]],
        );
      } finally {
        await db.query("UPDATE product_variants SET active = true WHERE product_id = (SELECT id FROM products WHERE legacy_id = 'p08')");
      }
    });

    it("a design on a kind without colors (mug) quotes as before", async () => {
      const quote = await quoteCart([{ productId: "p09", quantity: 2, designId: mugDesign }], deps);
      assert.equal(quote.valid, true);
      assert.deepEqual(quote.issues, []);
      assert.deepEqual(
        quote.lines.map((line) => [line.productId, line.sku, line.name, line.quantity, line.designId, line.designName]),
        [["p09", "SUB-P09", "Taza feliz · Taza", 2, mugDesign, "Taza feliz"]],
      );
    });
  });

  it("an order whose design was unpublished meanwhile is refused", async () => {
    await db.query("UPDATE designs SET status = 'archived' WHERE id = $1", [published]);
    const result = await checkout({ ...contact, idempotencyKey: key(), lines: [{ productId: "p08", quantity: 1, designId: published }] }, null, deps);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "cart");
    assert.equal(result.issues[0].code, "design_unavailable");
    await db.query("UPDATE designs SET status = 'published' WHERE id = $1", [published]);
  });
});
