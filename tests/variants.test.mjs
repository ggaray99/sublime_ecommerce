// Product variants: option parsing, combinations, SKUs, re-planning and the repository.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createAdminRepository } from "../src/server/admin/repository.ts";
import { createVariantRepository } from "../src/server/admin/variants-repository.ts";
import { combinations, parseOptionDefinitions, planVariants, variantSku } from "../src/server/admin/variants.ts";

const dbDir = join(import.meta.dirname, "..", "db");
const sqlFiles = (folder) =>
  readdirSync(join(dbDir, folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dbDir, folder, name), "utf8"));

const admin = { authUserId: "auth-admin", email: "admin@example.com", role: "owner" };
const sizes = { name: "Talle", values: ["S", "M", "L"] };
const colors = { name: "Color", values: ["Negro", "Blanco"] };

describe("variant options (pure)", () => {
  it("parses the form shape and the JSON shape", () => {
    const form = parseOptionDefinitions({ option1Name: "Talle", option1Values: "S, M ,L", option2Name: "", option2Values: "" });
    assert.deepEqual(form.value, [sizes]);
    const json = parseOptionDefinitions({ options: [sizes, colors] });
    assert.deepEqual(json.value, [sizes, colors]);
  });

  it("rejects duplicates, missing values, equal names and too many combinations", () => {
    assert.ok(parseOptionDefinitions({ option1Name: "Talle", option1Values: "S, s" }).errors.option1Values);
    assert.ok(parseOptionDefinitions({ option1Name: "Talle", option1Values: "" }).errors.option1Values);
    assert.ok(parseOptionDefinitions({ options: [sizes, { name: "talle", values: ["X"] }] }).errors.option2Name);
    assert.ok(parseOptionDefinitions({}).errors.option1Name);
    const many = Array.from({ length: 8 }, (_, i) => `V${i}`);
    assert.match(parseOptionDefinitions({ options: [{ name: "A", values: many }, { name: "B", values: many }] }).errors.options, /64 combinaciones/);
  });

  it("builds every combination in writing order", () => {
    assert.deepEqual(combinations([sizes, colors]).map((combo) => `${combo.Talle}-${combo.Color}`), [
      "S-Negro",
      "S-Blanco",
      "M-Negro",
      "M-Blanco",
      "L-Negro",
      "L-Blanco",
    ]);
  });

  it("generates readable, unique, valid SKUs", () => {
    const taken = new Set(["SUB-P13-M"]);
    assert.equal(variantSku("SUB-P13", { Talle: "XL", Color: "Azul ñandú" }, ["Talle", "Color"], new Set()), "SUB-P13-XL-AZULNAND");
    assert.equal(variantSku("SUB-P13", { Talle: "M" }, ["Talle"], taken), "SUB-P13-M-2");
    assert.match(variantSku("X".repeat(40), { Talle: "XXL" }, ["Talle"], new Set()), /^[A-Z0-9][A-Z0-9-]{1,39}$/);
  });

  it("re-plans: the original variant takes the first combination, removed ones are deactivated", () => {
    const first = planVariants([], [sizes], [{ id: "a", sku: "SUB-P13", options: {}, active: true, isDefault: true }], "SUB-P13");
    assert.deepEqual(first.updates, [{ id: "a", options: { Talle: "S" }, active: true, sortOrder: 0 }]);
    assert.deepEqual(first.inserts.map((insert) => insert.sku), ["SUB-P13-M", "SUB-P13-L"]);

    const existing = [
      { id: "a", sku: "SUB-P13", options: { Talle: "S" }, active: true, isDefault: true },
      { id: "b", sku: "SUB-P13-M", options: { Talle: "M" }, active: true, isDefault: false },
      { id: "c", sku: "SUB-P13-L", options: { Talle: "L" }, active: true, isDefault: false },
    ];
    // Rename the option and drop L: values are kept by position, L is deactivated, XL is created.
    const renamed = planVariants(["Talle"], [{ name: "Tamaño", values: ["S", "M", "XL"] }], existing, "SUB-P13");
    assert.deepEqual(
      renamed.updates.map((update) => [update.id, update.options.Tamaño, update.active]),
      [
        ["a", "S", true],
        ["b", "M", true],
        ["c", "L", false],
      ],
    );
    assert.deepEqual(renamed.inserts.map((insert) => insert.sku), ["SUB-P13-XL"]);
  });

  it("deactivates variants that collapse when an option is removed", () => {
    const existing = [
      { id: "a", sku: "X-S-N", options: { Talle: "S", Color: "Negro" }, active: true, isDefault: true },
      { id: "b", sku: "X-S-B", options: { Talle: "S", Color: "Blanco" }, active: true, isDefault: false },
    ];
    const plan = planVariants(["Talle", "Color"], [{ name: "Talle", values: ["S"] }], existing, "X");
    assert.deepEqual(plan.updates, [
      { id: "a", options: { Talle: "S" }, active: true, sortOrder: 0 },
      { id: "b", options: { Talle: "S", Color: "Blanco" }, active: false, sortOrder: 1 },
    ]);
    assert.equal(plan.inserts.length, 0);
  });
});

describe("variant repository on PostgreSQL (PGlite)", () => {
  let db;
  let variants;
  let products;

  before(async () => {
    db = new PGlite();
    for (const sql of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(sql);
    const query = { query: async (text, params) => (await db.query(text, params)).rows };
    variants = createVariantRepository(query);
    products = createAdminRepository(query);
  });
  after(() => db.close());

  it("creates one variant per size with the product price and empty stock", async () => {
    const list = await variants.configureOptions(admin, "p13", [sizes]);
    assert.deepEqual(
      list.map((variant) => [variant.sku, variant.options.Talle, variant.onHand, variant.active]),
      [
        ["SUB-P13", "S", 20, true],
        ["SUB-P13-M", "M", 0, true],
        ["SUB-P13-L", "L", 0, true],
      ],
    );
    assert.ok(list.every((variant) => variant.priceMinor === list[0].priceMinor));
    const product = await products.getProduct("p13");
    assert.deepEqual([product.optionNames, product.variantCount, product.onHand], [["Talle"], 3, 20]);
  });

  it("counts stock per variant and sums it for the product", async () => {
    await products.countStock(admin, "p13", { onHand: 7, reason: "restock", note: "" }, "SUB-P13-M");
    const product = await products.getProduct("p13");
    assert.equal(product.onHand, 27);
    const [movement] = await products.listMovements("p13");
    assert.deepEqual([movement.sku, movement.deltaOnHand], ["SUB-P13-M", 7]);
    assert.equal((await products.getProductBySku("SUB-P13-L")).id, "p13", "any variant SKU finds the product");
  });

  it("updates price and visibility per variant, keeping one active", async () => {
    const [, medium, large] = await variants.listVariants("p13");
    const updated = await variants.updateVariant(admin, "p13", large.id, { priceMinor: 2_150_000, active: false });
    assert.deepEqual([updated.priceMinor, updated.active], [2_150_000, false]);
    assert.equal((await products.getProduct("p13")).variantCount, 2);
    await variants.updateVariant(admin, "p13", medium.id, { priceMinor: medium.priceMinor, active: false });
    const [small] = await variants.listVariants("p13");
    await assert.rejects(variants.updateVariant(admin, "p13", small.id, { priceMinor: small.priceMinor, active: false }), (error) => error.code === "conflict");
    await assert.rejects(variants.updateVariant(admin, "p13", small.id, { priceMinor: 0, active: true }), (error) => error.code === "conflict");
  });

  it("re-shapes options: adds a color, reactivates sizes, never deletes", async () => {
    const list = await variants.configureOptions(admin, "p13", [sizes, colors]);
    const active = list.filter((variant) => variant.active);
    assert.equal(active.length, 6);
    assert.ok(active.some((variant) => variant.sku === "SUB-P13-M" && variant.options.Color === "Negro"), "existing variants keep their SKU");
    const [{ total }] = (await db.query("SELECT count(*)::int AS total FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.legacy_id = 'p13'")).rows;
    assert.equal(total, 6);
    const [entry] = await products.listAudit({ entityId: "p13", limit: 1 });
    assert.equal(entry.action, "variant.options");
  });

  it("finds the variant behind a SKU", async () => {
    const found = await variants.findBySku("SUB-P13-S-BLANCO");
    assert.deepEqual([found.productId, found.variant.options], ["p13", { Talle: "S", Color: "Blanco" }]);
    assert.equal(await variants.findBySku("NOPE-1"), null);
  });

  it("keeps made-to-order variants without price or stock", async () => {
    const quoted = await variants.configureOptions(admin, "p21", [{ name: "Tamaño", values: ["Chico", "Grande"] }]);
    assert.ok(quoted.every((variant) => variant.priceMinor === null && !variant.trackStock));
  });
});
