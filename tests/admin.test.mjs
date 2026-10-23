import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { AdminDataError, createAdminRepository } from "../src/server/admin/repository.ts";
import { parsePesos, parseProductUpdate, parseStockCount } from "../src/server/admin/validation.ts";

const form = (values) => new Map(Object.entries(values));
const migration = (name) => readFileSync(join(import.meta.dirname, "..", "db", "migrations", name), "utf8");

describe("admin form validation", () => {
  it("parses prices typed in Argentine format", () => {
    assert.equal(parsePesos("2500"), 250000);
    assert.equal(parsePesos("2.500"), 250000);
    assert.equal(parsePesos("$ 2.500,5"), 250050);
    assert.equal(parsePesos("1.234.567,89"), 123456789);
    assert.equal(parsePesos("2,500.00"), null);
    assert.equal(parsePesos("-10"), null);
    assert.equal(parsePesos("abc"), null);
  });

  it("requires a price except for quoted products", () => {
    assert.deepEqual(parseProductUpdate(form({ price: "1.800", status: "active" }), false), {
      ok: true,
      value: { priceMinor: 180000, status: "active" },
    });
    assert.equal(parseProductUpdate(form({ price: "0", status: "active" }), false).ok, false);
    assert.equal(parseProductUpdate(form({ price: "", status: "active" }), false).ok, false);
    assert.equal(parseProductUpdate(form({ price: "", status: "draft" }), true).ok, true);
    assert.equal(parseProductUpdate(form({ price: "500", status: "active" }), true).ok, false);
    assert.equal(parseProductUpdate(form({ price: "500", status: "deleted" }), false).ok, false);
  });

  it("validates stock counts and asks for a note on adjustments", () => {
    assert.equal(parseStockCount(form({ onHand: "12", reason: "restock", note: "" })).ok, true);
    assert.equal(parseStockCount(form({ onHand: "12", reason: "adjustment", note: "" })).ok, false);
    assert.equal(parseStockCount(form({ onHand: "-1", reason: "restock" })).ok, false);
    assert.equal(parseStockCount(form({ onHand: "1.5", reason: "restock" })).ok, false);
    assert.equal(parseStockCount(form({ onHand: "999999", reason: "restock" })).ok, false);
    assert.equal(parseStockCount(form({ onHand: "3", reason: "sale" })).ok, false);
  });
});

describe("admin repository on PostgreSQL (PGlite)", () => {
  let db;
  let repo;
  const owner = { authUserId: "auth-owner", email: "owner@example.com", role: "owner" };

  before(async () => {
    db = new PGlite();
    for (const name of ["0001_catalog_inventory.sql", "0002_customers.sql", "0003_admin.sql"]) await db.exec(migration(name));
    await db.exec(`
      INSERT INTO categories (id, label) VALUES ('stickers', 'Stickers'), ('custom', 'A medida');
      INSERT INTO products (legacy_id, slug, name, category_id, catalog_code, status)
        VALUES ('c088', 'sticker-088', 'Sticker 088', 'stickers', '088', 'active');
      INSERT INTO products (legacy_id, slug, name, category_id, requires_quote, status)
        VALUES ('p20', 'remera-a-medida', 'Remera a medida', 'custom', true, 'active');
      INSERT INTO product_variants (product_id, sku, price_minor, track_stock, is_default)
        SELECT id, 'STK-088', 150000, true, true FROM products WHERE legacy_id = 'c088';
      INSERT INTO product_variants (product_id, sku, price_minor, track_stock, is_default)
        SELECT id, 'SUB-P20', NULL, false, true FROM products WHERE legacy_id = 'p20';
      INSERT INTO inventory (variant_id, on_hand, reserved) SELECT id, 20, 2 FROM product_variants WHERE sku = 'STK-088';
    `);
    repo = createAdminRepository({ query: async (text, params) => (await db.query(text, params)).rows });
  });
  after(() => db.close());

  it("only recognizes users present in admin_users", async () => {
    assert.equal(await repo.findAdmin("auth-owner"), null);
    await repo.grantAdmin({ authUserId: "auth-owner", email: "owner@example.com" }, "owner", "test-script");
    assert.deepEqual(await repo.findAdmin("auth-owner"), owner);
    assert.equal(await repo.findAdmin("auth-someone-else"), null);
    const [entry] = await repo.listAudit();
    assert.equal(entry.action, "admin.grant");
  });

  it("lists and searches products with stock", async () => {
    assert.equal((await repo.listProducts()).length, 2);
    const [sticker] = await repo.listProducts({ query: "088" });
    assert.deepEqual([sticker.sku, sticker.onHand, sticker.reserved], ["STK-088", 20, 2]);
    assert.equal((await repo.listProducts({ query: "%" })).length, 0, "LIKE wildcards are literal");
    assert.equal((await repo.listProducts({ status: "draft" })).length, 0);
  });

  it("updates price and status with a before/after audit entry", async () => {
    const updated = await repo.updateProduct(owner, "c088", { priceMinor: 180000, status: "draft" });
    assert.deepEqual([updated.priceMinor, updated.status], [180000, "draft"]);
    const [entry] = await repo.listAudit({ entityId: "c088" });
    assert.equal(entry.action, "product.update");
    assert.equal(entry.actorEmail, "owner@example.com");
    assert.deepEqual(entry.changes, {
      before: { status: "active", priceMinor: 150000 },
      after: { status: "draft", priceMinor: 180000 },
    });
  });

  it("does not log saves that change nothing", async () => {
    const before = (await repo.listAudit({ entityId: "c088" })).length;
    await repo.updateProduct(owner, "c088", { priceMinor: 180000, status: "draft" });
    assert.equal((await repo.listAudit({ entityId: "c088" })).length, before);
  });

  it("never sets a price on quoted products", async () => {
    const updated = await repo.updateProduct(owner, "p20", { priceMinor: 999, status: "active" });
    assert.equal(updated.priceMinor, null);
  });

  it("records stock counts as a movement and an audit entry", async () => {
    const counted = await repo.countStock(owner, "c088", { onHand: 35, reason: "restock", note: "Llegó tirada nueva" });
    assert.equal(counted.onHand, 35);
    const [movement] = await repo.listMovements("c088");
    assert.deepEqual([movement.deltaOnHand, movement.reason, movement.actor], [15, "restock", "owner@example.com"]);
    const [entry] = await repo.listAudit({ entityId: "c088" });
    assert.deepEqual(entry.changes, { before: 20, after: 35, reason: "restock", note: "Llegó tirada nueva" });
  });

  it("refuses counts below reserved units and products made to order", async () => {
    await assert.rejects(repo.countStock(owner, "c088", { onHand: 1, reason: "adjustment", note: "x" }), (error) => {
      return error instanceof AdminDataError && error.code === "below_reserved";
    });
    await assert.rejects(repo.countStock(owner, "p20", { onHand: 5, reason: "restock", note: "" }), (error) => {
      return error.code === "untracked";
    });
    assert.equal((await repo.getProduct("c088")).onHand, 35, "the failed count left stock untouched");
  });

  it("rejects malformed and unknown product ids", async () => {
    await assert.rejects(repo.getProduct("c088' OR '1'='1"), (error) => error.code === "not_found");
    await assert.rejects(repo.updateProduct(owner, "zz999", { priceMinor: 1, status: "active" }), (error) => {
      return error.code === "not_found";
    });
  });

  it("keeps the audit trail constrained in the database", async () => {
    await assert.rejects(db.exec("INSERT INTO admin_users (auth_user_id, email, role, granted_by) VALUES ('x', 'x@y.z', 'root', 's')"));
    await assert.rejects(
      db.exec("INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id) VALUES ('a', 'b', 'DROP', 'product', 'c')"),
    );
  });
});
