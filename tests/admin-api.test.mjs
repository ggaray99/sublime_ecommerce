// /api/admin/v1 end to end over PostgreSQL (PGlite) with the full schema and seeds.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { handleAdminApi, MAX_BATCH } from "../src/server/api/handler.ts";
import { createApiKeyRepository, RATE_LIMIT } from "../src/server/api/keys.ts";
import { OPENAPI_SPEC } from "../src/server/api/openapi.ts";
import { applyPriceRule } from "../src/server/api/prices.ts";

const dbDir = join(import.meta.dirname, "..", "db");
const sqlFiles = (folder) =>
  readdirSync(join(dbDir, folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dbDir, folder, name), "utf8"));

const owner = { authUserId: "auth-owner", email: "owner@example.com", role: "owner" };

describe("price rules", () => {
  it("applies percentages and amounts with rounding, never to zero", () => {
    assert.equal(applyPriceRule(250000, { type: "percent", value: 12.5 }, "none"), 281250);
    assert.equal(applyPriceRule(250050, { type: "percent", value: 10 }, "nearest_100"), 275100);
    assert.equal(applyPriceRule(250000, { type: "amount", value: -1234 }, "nearest_1000"), 249000);
    assert.equal(applyPriceRule(1000, { type: "amount", value: -1000 }, "none"), null);
    assert.equal(applyPriceRule(1000, { type: "percent", value: -99.99 }, "nearest_1000"), null);
  });
});

describe("admin API v1 (PGlite)", () => {
  let db;
  let query;
  let keys;
  let full;
  let readOnly;
  let changes = 0;

  const deps = (available = true) => ({ sql: query, available, onCatalogChange: () => changes++ });
  const call = async (method, path, { token = full, body, headers = {}, available = true } = {}) => {
    const init = { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } };
    if (body !== undefined) {
      init.body = typeof body === "string" ? body : JSON.stringify(body);
      init.headers["content-type"] ??= "application/json";
    }
    const url = `https://sublime.test/api/admin/v1/${path}`;
    const response = await handleAdminApi(new Request(url, init), path.split("?")[0].split("/"), deps(available));
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const product = async (sku) => (await call("GET", `products/${sku}`)).body;

  before(async () => {
    db = new PGlite();
    for (const sql of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(sql);
    query = { query: async (text, params) => (await db.query(text, params)).rows };
    keys = createApiKeyRepository(query);
    full = (await keys.createKey(owner, "n8n-catalogo", ["catalog:read", "catalog:write", "prices:write", "stock:write"])).token;
    readOnly = (await keys.createKey(owner, "reportes", ["catalog:read"])).token;
  });
  after(() => db.close());

  describe("contract", () => {
    it("serves the OpenAPI document without a key", async () => {
      const response = await call("GET", "openapi.json", { token: null });
      assert.equal(response.status, 200);
      assert.equal(response.body.openapi, "3.1.0");
    });

    it("documents every path the handler serves", () => {
      for (const path of [
        "/products",
        "/products/{sku}",
        "/products/{sku}/archive",
        "/products/{sku}/options",
        "/products/bulk-upsert",
        "/products/bulk-archive",
        "/prices/bulk-update",
        "/stock/bulk-count",
        "/categories",
      ]) {
        assert.ok(OPENAPI_SPEC.paths[path], path);
      }
    });
  });

  describe("access", () => {
    it("is off where the database is off", async () => {
      assert.equal((await call("GET", "products", { available: false })).status, 503);
    });

    it("rejects missing, malformed, wrong and revoked keys", async () => {
      assert.equal((await call("GET", "products", { token: null })).status, 401);
      assert.equal((await call("GET", "products", { token: "abc" })).status, 401);
      const [prefix] = full.split("_").slice(2);
      assert.equal((await call("GET", "products", { token: `sk_sublime_${prefix}_${"x".repeat(43)}` })).status, 401, "right prefix, wrong secret");

      const temporary = await keys.createKey(owner, "temporal", ["catalog:read"]);
      assert.equal((await call("GET", "products", { token: temporary.token })).status, 200);
      await keys.revokeKey(owner, temporary.key.id);
      assert.equal((await call("GET", "products", { token: temporary.token })).status, 401);
    });

    it("enforces scopes per endpoint", async () => {
      assert.equal((await call("GET", "products", { token: readOnly })).status, 200);
      const denied = await call("POST", "prices/bulk-update", { token: readOnly, body: { items: [{ sku: "SUB-P08", priceMinor: 100 }] } });
      assert.equal(denied.status, 403);
      assert.match(denied.body.message, /prices:write/);
    });

    it("limits requests per key per minute", async () => {
      const [{ id }] = (await db.query("SELECT id FROM api_keys WHERE name = 'reportes'")).rows;
      await db.query("INSERT INTO api_rate_limits (key_id, window_start, requests) VALUES ($1, date_trunc('minute', now()), $2) ON CONFLICT (key_id, window_start) DO UPDATE SET requests = $2", [id, RATE_LIMIT]);
      const limited = await call("GET", "products", { token: readOnly });
      assert.equal(limited.status, 429);
      assert.ok(Number(limited.headers.get("retry-after")) > 0);
      await db.query("DELETE FROM api_rate_limits WHERE key_id = $1", [id]);
    });

    it("answers 404 for unknown resources and 405 for wrong methods", async () => {
      assert.equal((await call("GET", "orders")).status, 404);
      const wrong = await call("PATCH", "products", { body: {} });
      assert.equal(wrong.status, 405);
      assert.match(wrong.headers.get("allow"), /GET/);
    });
  });

  describe("reading", () => {
    it("lists with filters and page size, rejecting unknown parameters", async () => {
      const page = await call("GET", "products?categoryId=stickers&pageSize=5&sort=price_desc");
      assert.equal(page.status, 200);
      assert.equal(page.body.items.length, 5);
      assert.ok(page.body.items.every((item) => item.categoryId === "stickers"));
      assert.equal(page.body.items[0].currency, "ARS");
      const bad = await call("GET", "products?stock=maybe&limit=3");
      assert.equal(bad.status, 422);
      assert.deepEqual(bad.body.fields.map((field) => field.path).sort(), ["limit", "stock"]);
    });

    it("returns one product with its images and stock", async () => {
      const item = await product("SUB-P08");
      assert.equal(item.id, "p08");
      assert.ok(item.images.length > 0);
      assert.deepEqual(item.stock, { tracked: true, onHand: 20, reserved: 0, available: 20 });
      assert.equal((await call("GET", "products/SUB-NOPE")).status, 404);
    });

    it("supports incremental sync with updatedSince", async () => {
      await db.exec(`
        UPDATE products SET updated_at = now() - interval '1 day';
        UPDATE product_variants SET updated_at = now() - interval '1 day';
        UPDATE inventory SET updated_at = now() - interval '1 day';
      `);
      const since = new Date(Date.now() - 1000).toISOString();
      await call("PATCH", "products/SUB-P09", { body: { tags: ["sync-test"] } });
      const changed = await call("GET", `products?updatedSince=${encodeURIComponent(since)}`);
      assert.deepEqual(changed.body.items.map((item) => item.sku), ["SUB-P09"]);
    });

    it("lists categories", async () => {
      const { body } = await call("GET", "categories");
      assert.equal(body.items.length, 6);
    });
  });

  describe("writing", () => {
    it("creates products (draft by default), audited as the integration", async () => {
      const created = await call("POST", "products", {
        body: { name: "Llavero Cóndor", categoryId: "vinilos", theme: "argentina", priceMinor: 350000, sku: "LLV-001", initialStock: 8 },
      });
      assert.equal(created.status, 201);
      assert.deepEqual([created.body.sku, created.body.status, created.body.stock.onHand], ["LLV-001", "draft", 8]);
      const [entry] = (await db.query("SELECT actor_email, action FROM audit_logs WHERE entity_id = $1", [created.body.id])).rows;
      assert.deepEqual(entry, { actor_email: "integration:n8n-catalogo", action: "product.create" });
    });

    it("rejects unknown fields, invalid data and duplicates", async () => {
      const unknown = await call("POST", "products", { body: { name: "X", categoryId: "vinilos", theme: "grafico", priceMinor: 100, color: "rojo" } });
      assert.deepEqual([unknown.status, unknown.body.fields[0].path], [422, "color"]);
      const invalid = await call("POST", "products", { body: { name: "", categoryId: "vinilos", theme: "grafico", priceMinor: -5 } });
      assert.equal(invalid.status, 422);
      assert.ok(invalid.body.fields.some((field) => field.path === "priceMinor"));
      const duplicate = await call("POST", "products", { body: { name: "Otro", categoryId: "vinilos", theme: "grafico", priceMinor: 100, sku: "LLV-001" } });
      assert.equal(duplicate.status, 409);
    });

    it("patches only the fields sent and archives", async () => {
      const before = await product("LLV-001");
      const patched = await call("PATCH", "products/LLV-001", { body: { status: "active", tags: ["llavero"] } });
      assert.equal(patched.status, 200);
      assert.deepEqual([patched.body.status, patched.body.tags, patched.body.name, patched.body.priceMinor], ["active", ["llavero"], before.name, before.priceMinor]);
      const archived = await call("POST", "products/LLV-001/archive", { body: {} });
      assert.equal(archived.body.status, "archived");
    });

    it("checks the body format", async () => {
      assert.equal((await call("POST", "products", { body: "{nope", headers: { "content-type": "application/json" } })).status, 400);
      assert.equal((await call("POST", "products", { body: "a=b", headers: { "content-type": "text/plain" } })).status, 415);
      const tooMany = await call("POST", "products/bulk-archive", { body: { skus: Array.from({ length: MAX_BATCH + 1 }, (_, i) => `X-${i}`) } });
      assert.equal(tooMany.status, 413);
    });
  });

  describe("bulk operations", () => {
    it("upserts by SKU item by item, with a dry run that saves nothing", async () => {
      const items = [
        { sku: "SUB-P10", priceMinor: 700000 },
        { sku: "NEW-100", name: "Sticker Nuevo", categoryId: "stickers", theme: "grafico", priceMinor: 90000 },
        { sku: "SUB-P11", categoryId: "no-existe" },
        { sku: "SUB-P12" },
      ];
      const dry = await call("POST", "products/bulk-upsert", { body: { items, dryRun: true } });
      assert.deepEqual(dry.body.summary, { created: 1, updated: 1, unchanged: 1, skipped: 0, failed: 1 }, "the dry run already reports the missing category");
      assert.equal((await call("GET", "products/NEW-100")).status, 404, "dry run created nothing");

      const before = changes;
      const real = await call("POST", "products/bulk-upsert", { body: { items } });
      assert.deepEqual(real.body.summary, { created: 1, updated: 1, unchanged: 1, skipped: 0, failed: 1 });
      assert.equal(real.body.items[2].error.fields[0].path, "items[2].categoryId");
      assert.equal((await product("SUB-P10")).priceMinor, 700000);
      assert.equal(changes, before + 1, "the store cache is refreshed once per request");
    });

    it("sets exact prices and applies rules with before/after", async () => {
      const exact = await call("POST", "prices/bulk-update", { body: { items: [{ sku: "SUB-P10", priceMinor: 700000 }, { sku: "SUB-P13", priceMinor: 123400 }] } });
      assert.deepEqual(exact.body.summary, { created: 0, updated: 1, unchanged: 1, skipped: 0, failed: 0 });

      const stickersBefore = (await call("GET", "products?categoryId=stickers&pageSize=200")).body.items;
      const preview = await call("POST", "prices/bulk-update", { body: { rule: { type: "percent", value: 10 }, scope: { categoryId: "stickers" }, rounding: "nearest_100", dryRun: true } });
      assert.equal(preview.body.summary.updated, stickersBefore.length);
      const first = preview.body.items[0];
      assert.equal(first.after, Math.round((first.before * 1.1) / 100) * 100);
      assert.equal((await product(first.sku)).priceMinor, first.before, "dry run kept the price");

      const both = await call("POST", "prices/bulk-update", { body: { items: [], rule: { type: "percent", value: 5 } } });
      assert.equal(both.status, 422);
    });

    it("skips made-to-order products in price rules", async () => {
      const result = await call("POST", "prices/bulk-update", { body: { rule: { type: "amount", value: 1000 }, scope: { categoryId: "personalizados" }, dryRun: true } });
      assert.ok(result.body.summary.skipped > 0);
      assert.equal(result.body.summary.updated, 0);
    });

    it("counts stock, keeping reservations and audit rules", async () => {
      await db.exec("UPDATE inventory SET reserved = 2 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku = 'SUB-P13'");
      const result = await call("POST", "stock/bulk-count", {
        body: {
          items: [
            { sku: "SUB-P13", onHand: 30, reason: "restock" },
            { sku: "SUB-P13", onHand: 1, reason: "adjustment", note: "rotura" },
            { sku: "SUB-P14", onHand: 5, reason: "adjustment" },
          ],
        },
      });
      assert.deepEqual(result.body.summary, { created: 0, updated: 1, unchanged: 0, skipped: 0, failed: 2 });
      assert.deepEqual([result.body.items[0].before, result.body.items[0].after], [20, 30]);
      assert.match(result.body.items[1].error.fields[0].message, /reservadas/);
      assert.equal(result.body.items[2].error.fields[0].path, "items[2].note");
      const [movement] = (await db.query(
        "SELECT m.actor, m.delta_on_hand FROM inventory_movements m JOIN product_variants v ON v.id = m.variant_id WHERE v.sku = 'SUB-P13' ORDER BY m.id DESC LIMIT 1",
      )).rows;
      assert.deepEqual(movement, { actor: "integration:n8n-catalogo", delta_on_hand: 10 });

      // Restock only adds: lowering with "restock" is refused (dry run and real), "adjustment" with a note is not.
      const restockDown = await call("POST", "stock/bulk-count", { body: { dryRun: true, items: [{ sku: "SUB-P13", onHand: 25, reason: "restock" }] } });
      assert.equal(restockDown.body.summary.failed, 1);
      assert.equal(restockDown.body.items[0].error.fields[0].path, "items[0].reason");
      assert.match(restockDown.body.items[0].error.fields[0].message, /solo suma/);
      const adjustDown = await call("POST", "stock/bulk-count", { body: { items: [{ sku: "SUB-P13", onHand: 25, reason: "adjustment", note: "recuento" }] } });
      assert.equal(adjustDown.body.summary.updated, 1);
    });
  });

  describe("idempotency", () => {
    it("replays the original answer for the same key and body, and rejects a different body", async () => {
      const headers = { "idempotency-key": "carga-precios-2026-10-23" };
      const body = { items: [{ sku: "SUB-P15", priceMinor: 555500 }] };
      const first = await call("POST", "prices/bulk-update", { body, headers });
      assert.equal(first.body.summary.updated, 1);
      const replay = await call("POST", "prices/bulk-update", { body, headers });
      assert.equal(replay.headers.get("idempotent-replayed"), "true");
      assert.deepEqual(replay.body, first.body, "same answer, nothing applied twice");
      const conflict = await call("POST", "prices/bulk-update", { body: { items: [{ sku: "SUB-P15", priceMinor: 1 }] }, headers });
      assert.equal(conflict.status, 409);
      assert.equal((await call("POST", "products", { body: {}, headers: { "idempotency-key": "corta" } })).status, 422);
    });
  });
});
