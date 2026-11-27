// Status and "destacado" changes for one or many products (the product
// page's publication card and the list's bulk actions). Each product goes
// through the same validation and repository call as saving the product page,
// so the audit entry is the same `product.update` (PGlite with migrations).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { changeProducts, MAX_BULK_PRODUCTS, updateInputOf } from "../src/server/admin/product-changes.ts";
import { createAdminRepository } from "../src/server/admin/repository.ts";

const migrations = () =>
  readdirSync(join("db", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join("db", "migrations", name), "utf8"));

const owner = { authUserId: "auth-owner", email: "owner@example.com", role: "owner" };

describe("product status and featured changes", () => {
  let db;
  let repo;
  const audits = async (id) =>
    (await db.query(`SELECT action, changes FROM audit_logs WHERE entity = 'product' AND entity_id = $1 ORDER BY created_at`, [id])).rows;

  before(async () => {
    db = new PGlite();
    for (const sql of migrations()) await db.exec(sql);
    await db.exec(`
      INSERT INTO categories (id, label) VALUES ('stickers', 'Stickers'), ('personalizados', 'A medida');
      INSERT INTO products (legacy_id, slug, name, category_id, status) VALUES
        ('a1', 'sticker-a1', 'Sticker A1', 'stickers', 'draft'),
        ('a2', 'sticker-a2', 'Sticker A2', 'stickers', 'active'),
        ('base-sin-precio', 'remera-sin-precio', 'Remera sin precio', 'stickers', 'draft');
      INSERT INTO products (legacy_id, slug, name, category_id, requires_quote, status)
        VALUES ('q1', 'remera-a-medida', 'Remera a medida', 'personalizados', true, 'draft');
      INSERT INTO product_variants (product_id, sku, price_minor, track_stock, is_default)
        SELECT id, upper(legacy_id), 150000, false, true FROM products WHERE legacy_id IN ('a1', 'a2');
      INSERT INTO product_variants (product_id, sku, price_minor, track_stock, is_default)
        SELECT id, 'SIN-PRECIO', NULL, false, true FROM products WHERE legacy_id = 'base-sin-precio';
      INSERT INTO product_variants (product_id, sku, price_minor, track_stock, is_default)
        SELECT id, 'Q1', NULL, false, true FROM products WHERE legacy_id = 'q1';
    `);
    repo = createAdminRepository({ query: async (text, params) => (await db.query(text, params)).rows });
    await repo.grantAdmin(owner, "owner", "test");
  });
  after(() => db.close());

  it("publishes drafts and reports products already in that status as unchanged", async () => {
    const result = await changeProducts(repo, owner, ["a1", "a2"], { status: "active" });
    assert.deepEqual(result.changed.map((item) => item.id), ["a1"]);
    assert.deepEqual(result.unchanged.map((item) => item.id), ["a2"]);
    assert.deepEqual(result.skipped, []);
    assert.equal((await repo.getProduct("a1")).status, "active");
    // Same audit entry as saving the product page: only the changed field.
    assert.deepEqual(await audits("a1"), [{ action: "product.update", changes: { status: { before: "draft", after: "active" } } }]);
    assert.deepEqual(await audits("a2"), []);
  });

  it("skips products the product page would also refuse, with the same message", async () => {
    // A product that is not quoted needs a price to be saved.
    const result = await changeProducts(repo, owner, ["base-sin-precio"], { status: "active" });
    assert.deepEqual(result.changed, []);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].id, "base-sin-precio");
    assert.equal(result.skipped[0].name, "Remera sin precio");
    assert.match(result.skipped[0].reason, /precio/);
    assert.equal((await repo.getProduct("base-sin-precio")).status, "draft");
  });

  it("publishes quoted products, which have no price by design", async () => {
    const result = await changeProducts(repo, owner, ["q1"], { status: "active" });
    assert.deepEqual(result.changed.map((item) => item.id), ["q1"]);
  });

  it("archives and moves back to draft", async () => {
    assert.deepEqual((await changeProducts(repo, owner, ["a1"], { status: "archived" })).changed.map((item) => item.id), ["a1"]);
    assert.deepEqual((await changeProducts(repo, owner, ["a1"], { status: "draft" })).changed.map((item) => item.id), ["a1"]);
    assert.equal((await repo.getProduct("a1")).status, "draft");
  });

  it("turns featured on and off without touching anything else", async () => {
    const before = await repo.getProduct("a2");
    await changeProducts(repo, owner, ["a2"], { featured: true });
    const after = await repo.getProduct("a2");
    assert.equal(after.featured, true);
    assert.deepEqual({ ...updateInputOf(after), featured: before.featured }, updateInputOf(before));
    assert.deepEqual((await changeProducts(repo, owner, ["a2"], { featured: true })).unchanged.map((item) => item.id), ["a2"]);
    await changeProducts(repo, owner, ["a2"], { featured: false });
    assert.equal((await repo.getProduct("a2")).featured, false);
  });

  it("reports unknown and malformed ids as skipped and ignores repeated ids", async () => {
    const result = await changeProducts(repo, owner, ["zz999", "a1' OR '1'='1", "a2", "a2"], { status: "active" });
    assert.deepEqual(
      result.skipped.map((item) => [item.id, item.reason]),
      [
        ["zz999", "El producto no existe."],
        ["a1' OR '1'='1", "El producto no existe."],
      ],
    );
    assert.equal(result.changed.length + result.unchanged.length, 1);
  });

  it("refuses more products than one list page", async () => {
    const ids = Array.from({ length: MAX_BULK_PRODUCTS + 1 }, (_, index) => `p${index}`);
    await assert.rejects(changeProducts(repo, owner, ids, { status: "active" }), /hasta 50 productos/);
    assert.equal(MAX_BULK_PRODUCTS, 50);
  });
});
