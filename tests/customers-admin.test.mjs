// Admin → Clientes: everyone who signed up, with their orders and spending. Over PostgreSQL (PGlite).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createCustomerAdminRepository } from "../src/server/customers/admin.ts";

const migrations = () =>
  readdirSync(join("db", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join("db", "migrations", name), "utf8"));

describe("customers admin (PGlite)", () => {
  let db;
  let repo;

  async function signUp(id, name, email, createdAt) {
    await db.query("INSERT INTO auth_users (id, name, email, created_at) VALUES ($1, $2, $3, $4)", [id, name, email, createdAt]);
  }

  let orderSeq = 0;
  async function order(customerId, status, subtotal, extra = {}) {
    orderSeq++;
    await db.query(
      `INSERT INTO orders (access_token, customer_id, contact_name, contact_email, delivery, status, subtotal_minor, shipping_minor,
         discount_minor, idempotency_key, expires_at, created_at)
       VALUES ($1, $2, 'Ana Pérez', 'ana@example.com', '{"method":"pickup"}', $3, $4, $5, $6, $7, now(), $8)`,
      ["t".repeat(32), customerId, status, subtotal, extra.shipping ?? null, extra.discount ?? 0, `order-key-${orderSeq}`, extra.at ?? new Date()],
    );
  }

  before(async () => {
    db = new PGlite();
    for (const sql of migrations()) await db.exec(sql);
    repo = createCustomerAdminRepository({ query: async (text, params) => (await db.query(text, params)).rows });

    await signUp("u-ana", "Ana Pérez", "ana@example.com", "2026-11-01T10:00:00Z");
    await signUp("u-beto", "Beto Gómez", "beto@example.com", "2026-11-05T10:00:00Z");
    // Signed up but never opened Mi cuenta: no customers row yet.
    await signUp("u-caro", "Caro 100%", "caro_x@example.com", "2026-11-08T10:00:00Z");
    await db.query("INSERT INTO admin_users (auth_user_id, email, role, granted_by) VALUES ('u-beto', 'beto@example.com', 'owner', 'script')");

    const [{ id: ana }] = (
      await db.query("INSERT INTO customers (auth_user_id, email, full_name, phone) VALUES ('u-ana', 'ana@example.com', 'Ana Pérez', '261 555-1234') RETURNING id")
    ).rows;
    await db.query("INSERT INTO customers (auth_user_id, email, full_name) VALUES ('u-beto', 'beto@example.com', 'Beto Gómez')");
    await order(ana, "paid", 10_000_00, { shipping: 2_000_00, discount: 1_000_00, at: "2026-11-02T10:00:00Z" });
    await order(ana, "fulfilled", 5_000_00, { at: "2026-11-03T10:00:00Z" });
    await order(ana, "cancelled", 99_000_00, { at: "2026-11-04T10:00:00Z" });
    await db.query("INSERT INTO auth_sessions (id, user_id, token, expires_at, updated_at) VALUES ('s1', 'u-ana', 'tok', now() + interval '1 day', '2026-11-09T10:00:00Z')");
  });

  after(() => db?.close());

  it("lists everyone who signed up, newest first, with orders and what they paid", async () => {
    const list = await repo.list();
    assert.deepEqual(
      list.map((row) => row.authUserId),
      ["u-caro", "u-beto", "u-ana"],
    );
    const ana = list.find((row) => row.authUserId === "u-ana");
    assert.equal(ana.orderCount, 3);
    assert.equal(ana.paidOrderCount, 2);
    // Paid + fulfilled: 10.000 − 1.000 + 2.000 and 5.000; the cancelled one does not count.
    assert.equal(ana.spentMinor, 16_000_00);
    assert.equal(ana.lastOrderAt.toISOString(), "2026-11-04T10:00:00.000Z");
    assert.equal(ana.lastSeenAt.toISOString(), "2026-11-09T10:00:00.000Z");
    assert.equal(ana.phone, "261 555-1234");
    assert.equal(ana.customerId !== null, true);

    const caro = list.find((row) => row.authUserId === "u-caro");
    assert.deepEqual([caro.customerId, caro.orderCount, caro.spentMinor, caro.lastOrderAt, caro.isAdmin], [null, 0, 0, null, false]);
    assert.equal(list.find((row) => row.authUserId === "u-beto").isAdmin, true);
  });

  it("searches by name, email or phone, taking % and _ literally", async () => {
    assert.deepEqual((await repo.list({ search: "BETO" })).map((row) => row.authUserId), ["u-beto"]);
    assert.deepEqual((await repo.list({ search: "555-12" })).map((row) => row.authUserId), ["u-ana"]);
    assert.deepEqual((await repo.list({ search: "100%" })).map((row) => row.authUserId), ["u-caro"]);
    assert.deepEqual((await repo.list({ search: "o_x" })).map((row) => row.authUserId), ["u-caro"]);
    assert.deepEqual(await repo.list({ search: "nadie" }), []);
  });

  it("counts everyone and finds one person, or nobody", async () => {
    assert.equal(await repo.count(), 3);
    assert.equal((await repo.get("u-ana")).email, "ana@example.com");
    assert.equal(await repo.get("no-existe"), null);
    // Orders point to customers.id: the same person is found from there too.
    const { customerId } = await repo.get("u-ana");
    assert.equal((await repo.get(customerId)).authUserId, "u-ana");
  });
});
