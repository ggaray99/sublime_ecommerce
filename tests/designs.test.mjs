// Design catalog on PostgreSQL (PGlite) with the full schema and seeds.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createCategoryRepository } from "../src/server/admin/categories-repository.ts";
import { AdminDataError } from "../src/server/admin/repository.ts";
import { createDesignRepository, listStorefrontDesigns } from "../src/server/designs/repository.ts";
import { parseDesignInput } from "../src/server/designs/validation.ts";

const dbDir = join(import.meta.dirname, "..", "db");
const sqlFiles = (folder) =>
  readdirSync(join(dbDir, folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dbDir, folder, name), "utf8"));

const admin = { authUserId: "auth-admin", email: "admin@example.com", role: "owner" };
const image = { imageUrl: "/media/disenos/gato-0123456789abcdef01234567.webp", sourcePath: "disenos/gato-0123456789abcdef01234567.png", width: 3000, height: 3000, opaque: false };
const input = (overrides = {}) => ({ name: "Gato astronauta", slug: "gato-astronauta", description: "", categoryId: null, kinds: ["tshirt", "mug"], ...overrides });

describe("design validation", () => {
  it("derives the slug from the name and keeps the chosen base products", () => {
    const result = parseDesignInput({ name: "Gato Astronauta!", description: " Espacial ", categoryId: "", kinds: ["tshirt", "mug"] });
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, { name: "Gato Astronauta!", slug: "gato-astronauta", description: "Espacial", categoryId: null, kinds: ["tshirt", "mug"] });
  });

  it("accepts a single checkbox value from a form", () => {
    const result = parseDesignInput({ name: "Ola", kinds: "sticker" });
    assert.deepEqual(result.ok && result.value.kinds, ["sticker"]);
  });

  it("rejects a missing name, an unknown base product and a malformed slug", () => {
    const result = parseDesignInput({ name: "", slug: "Mal Slug", kinds: ["tshirt", "gorra"] });
    assert.equal(result.ok, false);
    assert.ok(result.errors.name);
    assert.ok(result.errors.slug);
    assert.ok(result.errors.kinds);
  });
});

describe("design repository", () => {
  let db;
  let designs;
  let categories;
  let products;

  before(async () => {
    db = new PGlite();
    for (const sql of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(sql);
    const sql = { query: async (text, params) => (await db.query(text, params)).rows };
    designs = createDesignRepository(sql);
    categories = createCategoryRepository(sql);
    designs.sql = sql;
    products = (await db.query(
      `SELECT p.id, p.legacy_id FROM products p
       WHERE p.status = 'active' AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active)
       ORDER BY p.legacy_id LIMIT 2`,
    )).rows;
  });

  after(async () => {
    await db.close();
  });

  it("creates drafts with their base products and logs the change", async () => {
    const id = await designs.createDesign(admin, input());
    const design = await designs.getDesign(id);
    assert.equal(design.status, "draft");
    assert.deepEqual(design.kinds, ["tshirt", "mug"]);
    const { rows } = await db.query(`SELECT action FROM audit_logs WHERE entity = 'design' AND entity_id = $1`, [id]);
    assert.deepEqual(rows.map((row) => row.action), ["design.create"]);
  });

  it("rejects a duplicated slug as a conflict", async () => {
    await assert.rejects(() => designs.createDesign(admin, input()), (error) => error instanceof AdminDataError && error.code === "conflict");
  });

  it("publishes only with an image and at least one base product", async () => {
    const id = await designs.createDesign(admin, input({ slug: "sin-imagen", kinds: [] }));
    await assert.rejects(() => designs.setDesignStatus(admin, id, "published"), /imagen/);
    await designs.setDesignImage(admin, id, image);
    await assert.rejects(() => designs.setDesignStatus(admin, id, "published"), /producto/);
    await designs.updateDesign(admin, id, input({ slug: "sin-imagen", kinds: ["sticker"] }));
    await designs.setDesignStatus(admin, id, "published");
    assert.equal((await designs.getDesign(id)).status, "published");
  });

  it("returns the previous files when the image is replaced", async () => {
    const id = await designs.createDesign(admin, input({ slug: "reemplazo" }));
    assert.deepEqual(await designs.setDesignImage(admin, id, image), { imageUrl: "", sourcePath: "" });
    const next = { ...image, imageUrl: "/media/disenos/otro.webp", sourcePath: "disenos/otro.png" };
    assert.deepEqual(await designs.setDesignImage(admin, id, next), { imageUrl: image.imageUrl, sourcePath: image.sourcePath });
  });

  it("links one product per mockup kind", async () => {
    await designs.setMockupBase(admin, "tshirt", products[0].legacy_id);
    await designs.setMockupBase(admin, "mug", products[1].legacy_id);
    const bases = await designs.listMockupBases();
    assert.equal(bases.tshirt.productId, products[0].id);
    assert.equal(bases.mug.productId, products[1].id);
    assert.equal(bases.tank, undefined);
    await assert.rejects(() => designs.setMockupBase(admin, "tank", products[0].legacy_id), (error) => error.code === "conflict");
    await assert.rejects(() => designs.setMockupBase(admin, "tank", "no-existe"), (error) => error.code === "not_found");
    assert.equal((await designs.listMockupBases()).tank, undefined);
    await designs.setMockupBase(admin, "mug", null);
    assert.equal((await designs.listMockupBases()).mug, undefined);
    await designs.setMockupBase(admin, "mug", products[1].legacy_id);
  });

  it("shows the store only published designs, on kinds with an active base product", async () => {
    const id = await designs.createDesign(admin, input({ slug: "publicado", kinds: ["tshirt", "tank"] }));
    await designs.setDesignImage(admin, id, image);
    await designs.setDesignStatus(admin, id, "published");
    const list = await listStorefrontDesigns(designs.sql);
    const found = list.find((design) => design.slug === "publicado");
    assert.deepEqual(found.bases, [{ kind: "tshirt", productId: products[0].legacy_id }]);
    assert.equal(list.some((design) => design.slug === "gato-astronauta"), false, "drafts stay hidden");
    // "sin-imagen" is published but only offered as a sticker, which has no base product.
    assert.equal(list.some((design) => design.slug === "sin-imagen"), false);
  });

  it("hides a design when its base product is not active", async () => {
    await db.query(`UPDATE products SET status = 'draft' WHERE id = $1`, [products[0].id]);
    const list = await listStorefrontDesigns(designs.sql);
    assert.equal(list.some((design) => design.slug === "publicado"), false);
    await db.query(`UPDATE products SET status = 'active' WHERE id = $1`, [products[0].id]);
  });

  it("keeps a category with designs from being deleted", async () => {
    await db.query(`INSERT INTO categories (id, label) VALUES ('solo-disenos', 'Solo diseños')`);
    await designs.createDesign(admin, input({ slug: "con-categoria", categoryId: "solo-disenos" }));
    await assert.rejects(() => categories.deleteCategory(admin, "solo-disenos"), (error) => error.code === "conflict");
  });

  it("still deletes an empty category", async () => {
    await db.query(`INSERT INTO categories (id, label) VALUES ('vacia', 'Vacía')`);
    await categories.deleteCategory(admin, "vacia");
    assert.equal((await db.query(`SELECT 1 FROM categories WHERE id = 'vacia'`)).rows.length, 0);
  });

  it("deletes a design without orders", async () => {
    const id = await designs.createDesign(admin, input({ slug: "borrar" }));
    await designs.deleteDesign(admin, id);
    await assert.rejects(() => designs.getDesign(id), (error) => error.code === "not_found");
  });
});
