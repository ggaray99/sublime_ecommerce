// Admin → Clientes list: URL search, filters, sorts and pages. Over PostgreSQL (PGlite).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createCustomerAdminRepository } from "../src/server/customers/admin.ts";
import { customerSearchToQuery, hasActiveCustomerFilters, parseCustomerSearch } from "../src/server/customers/customer-search.ts";

const migrations = () =>
  readdirSync(join("db", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join("db", "migrations", name), "utf8"));

async function freshDb() {
  const db = new PGlite();
  for (const sql of migrations()) await db.exec(sql);
  const repo = createCustomerAdminRepository({ query: async (text, params) => (await db.query(text, params)).rows });
  return { db, repo };
}

const search = (params = {}) => parseCustomerSearch(params);
const ids = (result) => result.items.map((row) => row.authUserId);

describe("customer list URL (parseCustomerSearch)", () => {
  it("defaults to every account, newest first, page 1", () => {
    assert.deepEqual(search(), { query: "", type: undefined, from: undefined, to: undefined, sort: "recientes", page: 1 });
    assert.equal(customerSearchToQuery(search()), "");
    assert.equal(hasActiveCustomerFilters(search()), false);
  });

  it("round-trips every parameter and omits the defaults", () => {
    const params = { q: "ana", tipo: "con-encargos", desde: "2026-11-01", hasta: "2026-11-30", orden: "total-desc", pagina: "3" };
    const parsed = search(params);
    assert.deepEqual(parsed, { query: "ana", type: "con-encargos", from: "2026-11-01", to: "2026-11-30", sort: "total-desc", page: 3 });
    assert.deepEqual(Object.fromEntries(new URLSearchParams(customerSearchToQuery(parsed).slice(1))), params);
    assert.deepEqual(search(Object.fromEntries(new URLSearchParams(customerSearchToQuery(parsed).slice(1)))), parsed);
    assert.equal(customerSearchToQuery(parsed, { page: 1, sort: "recientes" }), "?q=ana&tipo=con-encargos&desde=2026-11-01&hasta=2026-11-30");
    assert.equal(hasActiveCustomerFilters(parsed), true);
    assert.equal(hasActiveCustomerFilters(search({ orden: "nombre", pagina: "2" })), false);
    for (const key of ["q", "tipo", "desde", "hasta"]) assert.equal(hasActiveCustomerFilters(search({ [key]: params[key] })), true, key);
  });

  it("accepts every filter type and sort", () => {
    for (const tipo of ["con-pedidos-pagados", "sin-pedidos", "con-encargos", "admins"]) assert.equal(search({ tipo }).type, tipo);
    for (const orden of ["recientes", "antiguos", "nombre", "total-desc", "ultimo-pedido"]) assert.equal(search({ orden }).sort, orden);
  });

  it("ignores invalid values", () => {
    const parsed = search({ tipo: "vip", desde: "2026-02-30", hasta: "27/11/2026", orden: "random", pagina: "-2" });
    assert.deepEqual(parsed, search());
    assert.equal(search({ pagina: "1.5" }).page, 1);
    assert.equal(search({ pagina: "abc" }).page, 1);
    assert.equal(search({ q: ["  beto  ", "otro"] }).query, "beto");
    assert.equal(search({ q: "x".repeat(300) }).query.length, 100);
  });
});

describe("customer list search (PGlite)", () => {
  let db;
  let repo;

  async function signUp(id, name, email, createdAt) {
    await db.query("INSERT INTO auth_users (id, name, email, created_at) VALUES ($1, $2, $3, $4)", [id, name, email, createdAt]);
  }
  async function customer(authUserId, email, fullName, phone = null) {
    const [{ id }] = (
      await db.query("INSERT INTO customers (auth_user_id, email, full_name, phone) VALUES ($1, $2, $3, $4) RETURNING id", [authUserId, email, fullName, phone])
    ).rows;
    return id;
  }
  let seq = 0;
  async function order(customerId, status, subtotal, extra = {}) {
    seq++;
    await db.query(
      `INSERT INTO orders (access_token, customer_id, contact_name, contact_email, delivery, status, subtotal_minor, shipping_minor,
         discount_minor, idempotency_key, expires_at, created_at)
       VALUES ($1, $2, 'Contacto', 'contacto@example.com', '{"method":"pickup"}', $3, $4, $5, $6, $7, now(), $8)`,
      ["t".repeat(32), customerId, status, subtotal, extra.shipping ?? null, extra.discount ?? 0, `order-key-${seq}`, extra.at],
    );
  }

  before(async () => {
    ({ db, repo } = await freshDb());
    await signUp("u-ana", "Ana Pérez", "ana@example.com", "2026-11-01T10:00:00Z");
    await signUp("u-beto", "Beto Gómez", "beto@example.com", "2026-11-05T10:00:00Z");
    await signUp("u-caro", "Caro 100%", "caro_x@example.com", "2026-11-08T10:00:00Z");
    // 23:30 of 09/11 in Argentina (UTC−3).
    await signUp("u-dani", "Dani Ríos", "dani@example.com", "2026-11-10T02:30:00Z");
    // 00:30 of 10/11 in Argentina; no name: the list shows (and sorts by) the email.
    await signUp("u-eli", "", "aaron@example.com", "2026-11-10T03:30:00Z");
    await db.query("INSERT INTO admin_users (auth_user_id, email, role, granted_by) VALUES ('u-beto', 'beto@example.com', 'owner', 'script')");

    const ana = await customer("u-ana", "ana@example.com", "Ana Pérez", "261 555-1234");
    const beto = await customer("u-beto", "beto@example.com", "Beto Gómez");
    const dani = await customer("u-dani", "dani@example.com", "Dani Ríos");
    const eli = await customer("u-eli", "aaron@example.com", "");
    await order(ana, "paid", 10_000_00, { shipping: 2_000_00, discount: 1_000_00, at: "2026-11-02T10:00:00Z" });
    await order(ana, "fulfilled", 5_000_00, { at: "2026-11-03T10:00:00Z" });
    // Money received but not confirmed: never part of "Total pagado".
    await order(ana, "needs_review", 50_000_00, { at: "2026-11-04T10:00:00Z" });
    await order(dani, "pending_payment", 7_000_00, { at: "2026-11-06T10:00:00Z" });
    await order(eli, "shipped", 3_000_00, { at: "2026-11-11T10:00:00Z" });
    await db.query(
      `INSERT INTO custom_requests (access_token, customer_id, contact_name, contact_email, product_type, quantity, idea, idempotency_key)
       VALUES ($1, $2, 'Beto Gómez', 'beto@example.com', 'Stickers', 50, 'Una idea de stickers para la marca', 'request-key-1')`,
      ["r".repeat(32), beto],
    );
  });

  after(() => db?.close());

  it("lists every account newest first, and the total is the number of matches", async () => {
    const result = await repo.search(search());
    assert.deepEqual(ids(result), ["u-eli", "u-dani", "u-caro", "u-beto", "u-ana"]);
    assert.deepEqual([result.total, result.page, result.pageSize, result.pages], [5, 1, 50, 1]);
    const ana = result.items.find((row) => row.authUserId === "u-ana");
    // Paid + fulfilled (10.000 − 1.000 + 2.000, and 5.000); the order under review is not added.
    assert.deepEqual([ana.orderCount, ana.paidOrderCount, ana.spentMinor], [3, 2, 16_000_00]);
    assert.equal(result.items.find((row) => row.authUserId === "u-beto").requestCount, 1);
  });

  it("searches by name, email or phone, taking % and _ literally", async () => {
    assert.deepEqual(ids(await repo.search(search({ q: "BETO" }))), ["u-beto"]);
    assert.deepEqual(ids(await repo.search(search({ q: "aaron@" }))), ["u-eli"]);
    assert.deepEqual(ids(await repo.search(search({ q: "555-12" }))), ["u-ana"]);
    assert.deepEqual(ids(await repo.search(search({ q: "100%" }))), ["u-caro"]);
    assert.deepEqual(ids(await repo.search(search({ q: "o_x" }))), ["u-caro"]);
    assert.deepEqual(ids(await repo.search(search({ q: "%" }))), ["u-caro"]);
    const none = await repo.search(search({ q: "nadie" }));
    assert.deepEqual([none.items, none.total, none.pages], [[], 0, 1]);
  });

  it("filters by type", async () => {
    assert.deepEqual(ids(await repo.search(search({ tipo: "con-pedidos-pagados" }))), ["u-eli", "u-ana"]);
    assert.deepEqual(ids(await repo.search(search({ tipo: "sin-pedidos" }))), ["u-caro", "u-beto"]);
    assert.deepEqual(ids(await repo.search(search({ tipo: "con-encargos" }))), ["u-beto"]);
    assert.deepEqual(ids(await repo.search(search({ tipo: "admins" }))), ["u-beto"]);
  });

  it("combines every filter with AND, and counts only the matches", async () => {
    const both = await repo.search(search({ q: "beto", tipo: "sin-pedidos" }));
    assert.deepEqual([ids(both), both.total], [["u-beto"], 1]);
    const none = await repo.search(search({ q: "ana", tipo: "admins" }));
    assert.deepEqual([ids(none), none.total], [[], 0]);
    const ranged = await repo.search(search({ tipo: "con-pedidos-pagados", desde: "2026-11-10" }));
    assert.deepEqual([ids(ranged), ranged.total], [["u-eli"], 1]);
  });

  it("filters by sign-up date in Argentina time, both ends inclusive", async () => {
    // 23:30 of the "hasta" day is in; 00:30 of the next day is not.
    assert.deepEqual(ids(await repo.search(search({ hasta: "2026-11-09" }))), ["u-dani", "u-caro", "u-beto", "u-ana"]);
    assert.deepEqual(ids(await repo.search(search({ desde: "2026-11-10" }))), ["u-eli"]);
    assert.deepEqual(ids(await repo.search(search({ desde: "2026-11-09", hasta: "2026-11-09" }))), ["u-dani"]);
    assert.deepEqual(ids(await repo.search(search({ desde: "2026-11-05", hasta: "2026-11-08" }))), ["u-caro", "u-beto"]);
  });

  it("sorts by every order", async () => {
    const sorted = async (orden) => ids(await repo.search(search({ orden })));
    assert.deepEqual(await sorted("recientes"), ["u-eli", "u-dani", "u-caro", "u-beto", "u-ana"]);
    assert.deepEqual(await sorted("antiguos"), ["u-ana", "u-beto", "u-caro", "u-dani", "u-eli"]);
    // By the name shown: "aaron@example.com" (no name), Ana, Beto, Caro, Dani.
    assert.deepEqual(await sorted("nombre"), ["u-eli", "u-ana", "u-beto", "u-caro", "u-dani"]);
    // Ties (nothing paid) fall back to newest first.
    assert.deepEqual(await sorted("total-desc"), ["u-ana", "u-eli", "u-dani", "u-caro", "u-beto"]);
    // Last order of any status; accounts without orders go last.
    assert.deepEqual(await sorted("ultimo-pedido"), ["u-eli", "u-dani", "u-ana", "u-caro", "u-beto"]);
  });

  it("keeps list, count and get exactly as before", async () => {
    assert.equal(await repo.count(), 5);
    assert.deepEqual(
      (await repo.list()).map((row) => row.authUserId),
      ids(await repo.search(search())),
    );
    assert.deepEqual(await repo.list({ search: "o_x" }), (await repo.search(search({ q: "o_x" }))).items);
    assert.deepEqual((await repo.list({ limit: 2 })).map((row) => row.authUserId), ["u-eli", "u-dani"]);
    const ana = await repo.get("u-ana");
    assert.deepEqual(await repo.get(ana.customerId), ana);
    assert.equal(await repo.get("no-existe"), null);
  });
});

describe("customer list pages (PGlite)", () => {
  let db;
  let repo;

  before(async () => {
    ({ db, repo } = await freshDb());
    await db.query(
      `INSERT INTO auth_users (id, name, email, created_at)
       SELECT 'u-' || lpad(n::text, 2, '0'), 'Persona ' || n, 'persona' || n || '@example.com', timestamptz '2026-01-01T12:00:00Z' + n * interval '1 day'
       FROM generate_series(1, 56) AS n`,
    );
  });

  after(() => db?.close());

  it("shows 50 per page and the rest on the next one", async () => {
    const first = await repo.search(search());
    assert.deepEqual([first.items.length, first.total, first.page, first.pages], [50, 56, 1, 2]);
    assert.equal(first.items[0].authUserId, "u-56");
    const second = await repo.search(search({ pagina: "2" }));
    assert.deepEqual([second.items.length, second.total, second.page], [6, 56, 2]);
    assert.deepEqual(ids(second), ["u-06", "u-05", "u-04", "u-03", "u-02", "u-01"]);
    // A page past the end shows the last one.
    assert.equal((await repo.search(search({ pagina: "9" }))).page, 2);
    // The count follows the filters, not the whole table.
    const filtered = await repo.search(search({ q: "Persona 5" }));
    assert.deepEqual([filtered.total, filtered.pages], [8, 1]);
    assert.equal(await repo.count(), 56);
  });
});
