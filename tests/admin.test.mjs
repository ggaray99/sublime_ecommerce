import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { AdminDataError, createAdminRepository } from "../src/server/admin/repository.ts";
import { listStorefrontProducts } from "../src/server/catalog/postgres-storefront.ts";
import {
  parsePesos,
  parseProductCreate,
  parseProductUpdate,
  parseStockCount,
  slugify,
} from "../src/server/admin/validation.ts";

const migrationsDir = join(import.meta.dirname, "..", "db", "migrations");
const migrations = () =>
  readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(migrationsDir, name), "utf8"));

const content = {
  name: "Sticker Cóndor Andino",
  description: "Cóndor sobre la cordillera.",
  categoryId: "stickers",
  theme: "argentina",
  tags: "mendoza, Montaña, mendoza",
  details: "Vinilo laminado\nResiste agua",
};

/** Full update input from the current product plus a patch (what the edit form sends). */
const updateOf = (product, patch = {}) => ({
  name: product.name,
  slug: product.slug,
  description: product.description,
  categoryId: product.categoryId,
  theme: product.theme,
  tags: product.tags,
  details: product.details,
  featured: product.featured,
  catalogCode: product.catalogCode,
  status: product.status,
  priceMinor: product.priceMinor,
  ...patch,
});

describe("admin validation (shared by the panel and the API)", () => {
  it("parses prices typed in Argentine format", () => {
    assert.equal(parsePesos("2500"), 250000);
    assert.equal(parsePesos("2.500"), 250000);
    assert.equal(parsePesos("$ 2.500,5"), 250050);
    assert.equal(parsePesos("1.234.567,89"), 123456789);
    assert.equal(parsePesos("2,500.00"), null);
    assert.equal(parsePesos("-10"), null);
    assert.equal(parsePesos("abc"), null);
  });

  it("builds slugs from names", () => {
    assert.equal(slugify("Remera Ruido Visual!"), "remera-ruido-visual");
    assert.equal(slugify("  Ñandú en Córdoba  "), "nandu-en-cordoba");
  });

  it("normalizes form input: slug, tags, details and price", () => {
    const result = parseProductCreate({ ...content, price: "1.800" });
    assert.equal(result.ok, true);
    assert.deepEqual(
      {
        slug: result.value.slug,
        tags: result.value.tags,
        details: result.value.details,
        priceMinor: result.value.priceMinor,
        status: result.value.status,
        initialStock: result.value.initialStock,
      },
      {
        slug: "sticker-condor-andino",
        tags: ["mendoza", "montaña"],
        details: ["Vinilo laminado", "Resiste agua"],
        priceMinor: 180000,
        status: "draft",
        initialStock: 0,
      },
    );
  });

  it("accepts JSON input (arrays, priceMinor, booleans) for the future API", () => {
    const result = parseProductCreate({
      ...content,
      tags: ["a", "b"],
      details: ["uno"],
      priceMinor: 99900,
      featured: true,
      initialStock: 5,
    });
    assert.equal(result.ok, true);
    assert.deepEqual([result.value.priceMinor, result.value.featured, result.value.initialStock], [99900, true, 5]);
  });

  it("rejects invalid content with a message per field", () => {
    const result = parseProductCreate({ name: "", categoryId: "zapatos", theme: "x", catalogCode: "12", sku: "mal sku", initialStock: "-3" });
    assert.equal(result.ok, false);
    assert.deepEqual(Object.keys(result.errors).sort(), ["catalogCode", "categoryId", "initialStock", "name", "price", "sku", "slug", "theme"]);
  });

  it("requires a price except for quoted products", () => {
    assert.equal(parseProductUpdate({ ...content, price: "0", status: "active" }, false).ok, false);
    assert.equal(parseProductUpdate({ ...content, price: "", status: "active" }, false).ok, false);
    assert.equal(parseProductUpdate({ ...content, price: "", status: "draft" }, true).ok, true);
    assert.equal(parseProductUpdate({ ...content, price: "500", status: "active" }, true).ok, false);
    assert.equal(parseProductUpdate({ ...content, price: "500", status: "deleted" }, false).ok, false);
    assert.equal(parseProductCreate({ ...content, requiresQuote: "on", initialStock: "4" }).ok, false, "made to order has no stock");
  });

  it("validates stock counts and asks for a note on adjustments", () => {
    assert.equal(parseStockCount({ onHand: "12", reason: "restock", note: "" }).ok, true);
    assert.equal(parseStockCount({ onHand: "12", reason: "adjustment", note: "" }).ok, false);
    assert.equal(parseStockCount({ onHand: "-1", reason: "restock" }).ok, false);
    assert.equal(parseStockCount({ onHand: "1.5", reason: "restock" }).ok, false);
    assert.equal(parseStockCount({ onHand: "999999", reason: "restock" }).ok, false);
    assert.equal(parseStockCount({ onHand: "3", reason: "sale" }).ok, false);
  });
});

describe("admin repository on PostgreSQL (PGlite)", () => {
  let db;
  let repo;
  let query;
  const owner = { authUserId: "auth-owner", email: "owner@example.com", role: "owner" };

  before(async () => {
    db = new PGlite();
    for (const sql of migrations()) await db.exec(sql);
    await db.exec(`
      INSERT INTO categories (id, label) VALUES ('stickers', 'Stickers'), ('personalizados', 'A medida');
      INSERT INTO products (legacy_id, slug, name, category_id, catalog_code, status)
        VALUES ('c088', 'sticker-088', 'Sticker 088', 'stickers', '088', 'active');
      INSERT INTO products (legacy_id, slug, name, category_id, requires_quote, status)
        VALUES ('p20', 'remera-a-medida', 'Remera a medida', 'personalizados', true, 'active');
      INSERT INTO product_variants (product_id, sku, price_minor, track_stock, is_default)
        SELECT id, 'STK-088', 150000, true, true FROM products WHERE legacy_id = 'c088';
      INSERT INTO product_variants (product_id, sku, price_minor, track_stock, is_default)
        SELECT id, 'SUB-P20', NULL, false, true FROM products WHERE legacy_id = 'p20';
      INSERT INTO inventory (variant_id, on_hand, reserved) SELECT id, 20, 2 FROM product_variants WHERE sku = 'STK-088';
    `);
    query = { query: async (text, params) => (await db.query(text, params)).rows };
    repo = createAdminRepository(query);
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

  it("updates content, price and status with an audit entry of only what changed", async () => {
    const current = await repo.getProduct("c088");
    const updated = await repo.updateProduct(
      owner,
      "c088",
      updateOf(current, { name: "Sticker 088 nuevo", tags: ["auto"], priceMinor: 180000, status: "draft" }),
    );
    assert.deepEqual(
      [updated.name, updated.tags, updated.priceMinor, updated.status],
      ["Sticker 088 nuevo", ["auto"], 180000, "draft"],
    );
    const [entry] = await repo.listAudit({ entityId: "c088" });
    assert.equal(entry.action, "product.update");
    assert.deepEqual(entry.changes, {
      name: { before: "Sticker 088", after: "Sticker 088 nuevo" },
      tags: { before: [], after: ["auto"] },
      status: { before: "active", after: "draft" },
      priceMinor: { before: 150000, after: 180000 },
    });
  });

  it("does not log saves that change nothing", async () => {
    const before = (await repo.listAudit({ entityId: "c088" })).length;
    await repo.updateProduct(owner, "c088", updateOf(await repo.getProduct("c088")));
    assert.equal((await repo.listAudit({ entityId: "c088" })).length, before);
  });

  it("never sets a price on quoted products", async () => {
    const quoted = await repo.getProduct("p20");
    const updated = await repo.updateProduct(owner, "p20", updateOf(quoted, { priceMinor: 999 }));
    assert.equal(updated.priceMinor, null);
  });

  it("reports duplicate slugs and catalog codes as conflicts", async () => {
    const quoted = await repo.getProduct("p20");
    await assert.rejects(repo.updateProduct(owner, "p20", updateOf(quoted, { slug: "sticker-088" })), (error) => {
      return error instanceof AdminDataError && error.code === "conflict" && /URL/.test(error.message);
    });
    await assert.rejects(repo.updateProduct(owner, "p20", updateOf(quoted, { catalogCode: "088" })), (error) => {
      return error.code === "conflict" && /código/.test(error.message);
    });
  });

  it("creates a product with variant, initial stock movement and audit entry", async () => {
    const input = parseProductCreate({ ...content, price: "2.500", initialStock: "12", status: "active" });
    const created = await repo.createProduct(owner, input.value);
    assert.match(created.id, /^x[a-z0-9]{8}$/);
    assert.equal(created.sku, `SUB-${created.id.toUpperCase()}`);
    assert.deepEqual([created.priceMinor, created.onHand, created.trackStock], [250000, 12, true]);

    const [movement] = await repo.listMovements(created.id);
    assert.deepEqual([movement.deltaOnHand, movement.reason], [12, "initial_count"]);
    const [entry] = await repo.listAudit({ entityId: created.id });
    assert.equal(entry.action, "product.create");

    const store = await listStorefrontProducts(query);
    const shown = store.find((product) => product.id === created.id);
    assert.equal(shown.name, "Sticker Cóndor Andino");
    assert.equal(shown.stock, 12);
    assert.equal(store.at(-1).id, created.id, "new products go to the end of the store order");
  });

  it("creates made-to-order products without price or stock, as drafts by default", async () => {
    const input = parseProductCreate({ ...content, name: "Etiqueta a medida", categoryId: "personalizados", requiresQuote: "on" });
    const created = await repo.createProduct(owner, input.value);
    assert.deepEqual([created.priceMinor, created.trackStock, created.status], [null, false, "draft"]);
    assert.equal((await listStorefrontProducts(query)).some((product) => product.id === created.id), false, "drafts stay hidden");
  });

  it("rejects a new product whose slug or SKU already exists, leaving nothing behind", async () => {
    const count = (await repo.listProducts()).length;
    const duplicate = parseProductCreate({ ...content, price: "100", sku: "STK-088" }).value;
    await assert.rejects(repo.createProduct(owner, { ...duplicate, slug: "otro-slug" }), (error) => error.code === "conflict");
    await assert.rejects(repo.createProduct(owner, duplicate), (error) => error.code === "conflict");
    assert.equal((await repo.listProducts()).length, count);
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
    await assert.rejects(repo.updateProduct(owner, "zz999", updateOf(await repo.getProduct("c088"))), (error) => {
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
