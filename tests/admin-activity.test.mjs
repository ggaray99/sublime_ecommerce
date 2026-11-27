// Business rule (docs/admin-orders-rules.md, 3): Admin › Actividad shows order
// events next to the audit log, reading the existing order history
// (order_events) — nothing is copied into audit_logs — newest first, with a
// cursor that pages both sources together.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createAdminRepository } from "../src/server/admin/repository.ts";

const files = (folder) =>
  readdirSync(join("db", folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join("db", folder, name), "utf8"));

describe("Admin activity: audit log + order history (PGlite)", () => {
  let db;
  let repo;
  let orderId;
  let orderNumber;

  before(async () => {
    db = new PGlite();
    for (const sql of files("migrations")) await db.exec(sql);
    repo = createAdminRepository({ query: async (text, params) => (await db.query(text, params)).rows });
    const audit = (minute, action, entity, entityId, changes = {}) =>
      db.query(
        `INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes, created_at)
         VALUES ('auth-admin', 'admin@example.com', $1, $2, $3, $4::jsonb, '2026-11-20T12:00:00Z'::timestamptz + make_interval(mins => $5))`,
        [action, entity, entityId, JSON.stringify(changes), minute],
      );
    const { rows } = await db.query(
      `INSERT INTO orders (contact_name, contact_email, contact_phone, delivery, subtotal_minor, idempotency_key, access_token, expires_at, status)
       VALUES ('Ana', 'ana@example.com', '', '{"method":"pickup"}', 100000, 'activity-test-key-1', 'token-activity-test-000000000000000001', now(), 'paid')
       RETURNING id, number`,
    );
    orderId = rows[0].id;
    orderNumber = rows[0].number;
    const event = (minute, from, to, actor, note) =>
      db.query(
        `INSERT INTO order_events (order_id, from_status, to_status, actor, note, created_at)
         VALUES ($1, $2, $3, $4, $5, '2026-11-20T12:00:00Z'::timestamptz + make_interval(mins => $6))`,
        [orderId, from, to, actor, note, minute],
      );
    // Interleaved in time: audit 0, event 1, audit 2, event 3, audit 4 (export of orders), event 5.
    await audit(0, "product.update", "product", "p08", { name: "Pack" });
    await event(1, null, "pending_payment", "checkout", "Pedido creado; stock reservado por 15 minutos.");
    await audit(2, "category.update", "category", "packs", { label: "Packs" });
    await event(3, "pending_payment", "paid", "admin@example.com", "Transferencia recibida.");
    await audit(4, "export.orders", "order", "seleccion", { count: 1 });
    await event(5, "paid", "fulfilled", "system", "");
  });
  after(() => db.close());

  const summary = (entries) => entries.map((entry) => `${entry.action}:${entry.entityId}`);

  it("merges the audit log and the order history, newest first", async () => {
    const entries = await repo.listActivity({ limit: 50 });
    assert.deepEqual(summary(entries), [
      `order.status:SUB-${orderNumber}`,
      "export.orders:seleccion",
      `order.status:SUB-${orderNumber}`,
      "category.update:packs",
      `order.status:SUB-${orderNumber}`,
      "product.update:p08",
    ]);
    const paid = entries[2];
    assert.equal(paid.entity, "order");
    assert.equal(paid.actorEmail, "admin@example.com");
    assert.deepEqual(paid.changes, { number: orderNumber, from: "pending_payment", to: "paid", note: "Transferencia recibida." });
    assert.equal(paid.href, `/admin/pedidos/${orderId}`);
    assert.equal(entries[0].actorEmail, "system");
  });

  it("does not copy order events into audit_logs", async () => {
    const { rows } = await db.query("SELECT count(*)::int AS n FROM audit_logs WHERE action = 'order.status'");
    assert.equal(rows[0].n, 0);
  });

  it("filters by area: Pedidos y encargos shows order events and order exports; other areas only their audit", async () => {
    assert.deepEqual(summary(await repo.listActivity({ entity: "order", limit: 50 })), [
      `order.status:SUB-${orderNumber}`,
      "export.orders:seleccion",
      `order.status:SUB-${orderNumber}`,
      `order.status:SUB-${orderNumber}`,
    ]);
    assert.deepEqual(summary(await repo.listActivity({ entity: "product", limit: 50 })), ["product.update:p08"]);
  });

  it("pages both sources together without gaps or repeats", async () => {
    const all = summary(await repo.listActivity({ limit: 50 }));
    const seen = [];
    let before;
    for (let i = 0; i < 10; i++) {
      const page = await repo.listActivity({ limit: 2, before });
      if (!page.length) break;
      seen.push(...summary(page));
      before = page[page.length - 1].id;
    }
    assert.deepEqual(seen, all);
  });

  it("pages entries that share the same instant across both sources", async () => {
    const at = "2026-11-21T09:30:00.123456Z";
    await db.query(
      `INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes, created_at)
       VALUES ('auth-admin', 'admin@example.com', 'product.update', 'product', 'p09', '{}'::jsonb, $1), ('auth-admin', 'admin@example.com', 'product.update', 'product', 'p10', '{}'::jsonb, $1)`,
      [at],
    );
    await db.query(`INSERT INTO order_events (order_id, from_status, to_status, actor, note, created_at) VALUES ($1, 'fulfilled', 'fulfilled', 'system', 'empate', $2)`, [orderId, at]);
    const all = summary(await repo.listActivity({ limit: 50 }));
    const seen = [];
    let before;
    for (let i = 0; i < 20; i++) {
      const page = await repo.listActivity({ limit: 1, before });
      if (!page.length) break;
      seen.push(...summary(page));
      before = page[0].id;
    }
    assert.deepEqual(seen, all);
    assert.equal(all.length, 9);
    await db.query("DELETE FROM audit_logs WHERE entity_id IN ('p09', 'p10')").catch(() => {});
    await db.query("DELETE FROM order_events WHERE note = 'empate'");
  });

  it("keeps working with the old cursor (a numeric audit_logs id)", async () => {
    const { rows } = await db.query("SELECT id FROM audit_logs WHERE action = 'category.update'");
    const entries = await repo.listActivity({ limit: 50, before: String(rows[0].id) });
    assert.deepEqual(summary(entries), [`order.status:SUB-${orderNumber}`, "product.update:p08"]);
  });

  it("ignores malformed cursors instead of failing", async () => {
    assert.equal((await repo.listActivity({ limit: 50, before: "nope'; DROP TABLE x" })).length, 6);
    // Out of the bigint range: back to the first page, never an error.
    for (const before of ["99999999999999999999.a.1", "9223372036854775808.o.1", "1.a.99999999999999999999", "-5", "1.x.2"]) {
      assert.equal((await repo.listActivity({ limit: 50, before })).length, 6, before);
    }
  });

  it("leaves listAudit (per-record history) unchanged", async () => {
    assert.deepEqual(summary(await repo.listAudit({ limit: 50 })), ["export.orders:seleccion", "category.update:packs", "product.update:p08"]);
  });
});
