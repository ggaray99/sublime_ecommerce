// Categories and product images on PostgreSQL (PGlite) with the full schema and seeds.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createCategoryRepository } from "../src/server/admin/categories-repository.ts";
import { createImageRepository, MAX_IMAGES_PER_PRODUCT, reorder } from "../src/server/admin/images-repository.ts";
import { AdminDataError, createAdminRepository } from "../src/server/admin/repository.ts";
import { parseCategoryCreate, parseCategoryUpdate } from "../src/server/admin/validation.ts";
import { listStorefrontCategories, listStorefrontProducts } from "../src/server/catalog/postgres-storefront.ts";

const dbDir = join(import.meta.dirname, "..", "db");
const sqlFiles = (folder) =>
  readdirSync(join(dbDir, folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dbDir, folder, name), "utf8"));

const admin = { authUserId: "auth-admin", email: "admin@example.com", role: "owner" };
const info = { type: "image/webp", extension: "webp", width: 1200, height: 1200, size: 120_000 };
const upload = (n) => ({ url: `https://abc.public.blob.vercel-storage.com/productos/p01/imagen-${n}.webp`, pathname: `productos/p01/imagen-${n}.webp`, alt: `Foto ${n}`, info });

describe("category validation", () => {
  it("derives the id from the name and keeps it URL-safe", () => {
    const result = parseCategoryCreate({ label: "Llaveros y Pines", tagline: "", description: "", sortOrder: "7", active: "on" });
    assert.equal(result.ok, true);
    assert.deepEqual([result.value.id, result.value.sortOrder, result.value.active], ["llaveros-y-pines", 7, true]);
  });

  it("rejects bad ids, empty names and invalid order", () => {
    const result = parseCategoryCreate({ id: "Mal ID!", label: "", sortOrder: "-1" });
    assert.deepEqual(Object.keys(result.errors).sort(), ["id", "label", "sortOrder"]);
    assert.equal(parseCategoryUpdate({ label: "X", active: "off" }).value.active, false);
  });
});

describe("image reordering", () => {
  it("moves to first, up and down without gaps", () => {
    assert.deepEqual(reorder(["a", "b", "c"], "c", "first"), ["c", "a", "b"]);
    assert.deepEqual(reorder(["a", "b", "c"], "b", "up"), ["b", "a", "c"]);
    assert.deepEqual(reorder(["a", "b", "c"], "a", "up"), ["a", "b", "c"]);
    assert.deepEqual(reorder(["a", "b", "c"], "c", "down"), ["a", "b", "c"]);
  });
});

describe("categories and images on PostgreSQL (PGlite)", () => {
  let db;
  let query;
  let categories;
  let images;
  let products;

  before(async () => {
    db = new PGlite();
    for (const sql of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(sql);
    query = { query: async (text, params) => (await db.query(text, params)).rows };
    categories = createCategoryRepository(query);
    images = createImageRepository(query);
    products = createAdminRepository(query);
  });
  after(() => db.close());

  it("lists the seeded categories with product counts", async () => {
    const list = await categories.listCategories();
    assert.equal(list.length, 6);
    const stickers = list.find((category) => category.id === "stickers");
    assert.ok(stickers.productCount > 0);
    assert.equal(stickers.imageUrl, "/demo/categories/stickers.webp");
  });

  it("creates a category, moves a product into it and shows both in the store", async () => {
    const input = parseCategoryCreate({ label: "Llaveros", tagline: "Para colgar", description: "Acrílico", sortOrder: "1", active: "on" });
    await categories.createCategory(admin, input.value);
    const product = await products.getProduct("p08");
    await products.updateProduct(admin, "p08", { ...product, categoryId: "llaveros" });

    const storeCategories = await listStorefrontCategories(query);
    assert.deepEqual(
      storeCategories.slice(0, 2).map((category) => category.id),
      ["stickers", "llaveros"],
      "sorted by order, then name",
    );
    const moved = (await listStorefrontProducts(query)).find((item) => item.id === "p08");
    assert.deepEqual([moved.category, moved.categoryLabel], ["llaveros", "Llaveros"]);
  });

  it("rejects products pointing to a category that does not exist", async () => {
    const product = await products.getProduct("p09");
    await assert.rejects(products.updateProduct(admin, "p09", { ...product, categoryId: "no-existe" }), (error) => {
      return error instanceof AdminDataError && /categoría/.test(error.message);
    });
  });

  it("rejects duplicate category ids", async () => {
    const input = parseCategoryCreate({ id: "llaveros", label: "Otra", sortOrder: "0" });
    await assert.rejects(categories.createCategory(admin, input.value), (error) => error.code === "conflict");
  });

  it("hides a category together with its products, and audits only what changed", async () => {
    const current = await categories.getCategory("llaveros");
    await categories.updateCategory(admin, "llaveros", { ...current, active: false });
    assert.equal((await listStorefrontCategories(query)).some((category) => category.id === "llaveros"), false);
    assert.equal((await listStorefrontProducts(query)).some((item) => item.id === "p08"), false);

    const [entry] = await products.listAudit({ entity: "category", entityId: "llaveros" });
    assert.deepEqual(entry.changes, { active: { before: true, after: false } });
  });

  it("deletes only categories without products", async () => {
    await assert.rejects(categories.deleteCategory(admin, "llaveros"), (error) => error.code === "conflict");
    const product = await products.getProduct("p08");
    await products.updateProduct(admin, "p08", { ...product, categoryId: "packs" });
    await categories.deleteCategory(admin, "llaveros");
    await assert.rejects(categories.getCategory("llaveros"), (error) => error.code === "not_found");
  });

  it("returns the previous category image so the old file can be deleted", async () => {
    const previous = await categories.setCategoryImage(admin, "packs", "https://abc.public.blob.vercel-storage.com/categorias/packs/imagen.webp");
    assert.equal(previous, "/demo/categories/packs.webp");
    assert.equal((await listStorefrontCategories(query)).find((category) => category.id === "packs").image.startsWith("https://"), true);
  });

  it("appends uploaded images after the catalog ones and records metadata", async () => {
    const before = await images.listImages("p08");
    await images.addImage(admin, "p08", upload(1));
    const after = await images.listImages("p08");
    assert.equal(after.length, before.length + 1);
    const added = after.at(-1);
    assert.deepEqual([added.position, added.uploaded, added.width, added.sizeBytes], [before.length, true, 1200, 120_000]);
    assert.equal(before.every((image) => !image.uploaded), true, "catalog images are not uploads");
  });

  it("makes an image the cover and the store follows the new order", async () => {
    const list = await images.listImages("p08");
    const uploaded = list.at(-1);
    await images.moveImage(admin, "p08", uploaded.id, "first");
    const reordered = await images.listImages("p08");
    assert.equal(reordered[0].id, uploaded.id);
    assert.deepEqual(
      reordered.map((image) => image.position),
      reordered.map((_, index) => index),
    );
    const product = (await listStorefrontProducts(query)).find((item) => item.id === "p08");
    assert.equal(product.images[0].src, uploaded.url);
  });

  it("updates alt text and removes images closing the gap", async () => {
    const [cover, second] = await images.listImages("p08");
    await images.updateAlt(admin, "p08", second.id, "Vista trasera");
    const url = await images.removeImage(admin, "p08", cover.id);
    assert.equal(url, cover.url);
    const rest = await images.listImages("p08");
    assert.equal(rest[0].alt, "Vista trasera");
    assert.deepEqual(
      rest.map((image) => image.position),
      rest.map((_, index) => index),
    );
    const actions = (await products.listAudit({ entityId: "p08", limit: 5 })).map((entry) => entry.action);
    assert.deepEqual(actions.slice(0, 3), ["image.remove", "image.alt", "image.move"]);
  });

  it(`limits each product to ${MAX_IMAGES_PER_PRODUCT} images`, async () => {
    for (let n = (await images.listImages("p09")).length; n < MAX_IMAGES_PER_PRODUCT; n++) await images.addImage(admin, "p09", upload(100 + n));
    await assert.rejects(images.addImage(admin, "p09", upload(999)), (error) => error.code === "conflict");
  });

  it("ignores image ids from other products and malformed ids", async () => {
    const [foreign] = await images.listImages("p09");
    await assert.rejects(images.removeImage(admin, "p08", foreign.id), (error) => error.code === "not_found");
    await assert.rejects(images.updateAlt(admin, "p08", "1 OR 1=1", "x"), (error) => error.code === "not_found");
    assert.equal((await images.listImages("p09")).length, MAX_IMAGES_PER_PRODUCT);
  });
});
