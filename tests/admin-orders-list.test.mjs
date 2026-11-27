// Admin orders list (/admin/pedidos): URL search parsing, the read-only
// searchOrders query (search, payment/delivery/status filters, Argentina date
// range, sort, pagination) and the bulk "Marcar entregado" over the existing
// per-order markFulfilled transition.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { fulfillOrders, fulfillResultMessage, MAX_BULK_ORDERS, parseFulfillInput } from "../src/server/orders/bulk-orders.ts";
import { hasActiveOrderFilters, orderSearchToQuery, parseOrderSearch } from "../src/server/orders/order-search.ts";
import { createOrderRepository } from "../src/server/orders/repository.ts";

const dbDir = join(import.meta.dirname, "..", "db");
const migrations = readdirSync(join(dbDir, "migrations"))
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(dbDir, "migrations", name), "utf8"));

async function freshDb() {
  const db = new PGlite();
  for (const sql of migrations) await db.exec(sql);
  const repo = createOrderRepository({ query: async (text, params) => (await db.query(text, params)).rows });
  let counter = 0;
  /** Inserts an order that satisfies the table's checks; returns { id, number }. */
  async function insert({ name, email, status = "pending_payment", method = "pickup", city = "Mendoza", subtotal = 100000, shipping = 0, createdAt }) {
    const delivery =
      method === "pickup"
        ? { method: "pickup" }
        : { method: "shipping", address: { recipient: name, street: "San Martín", streetNumber: "100", apartment: "", city, province: "Mendoza", postalCode: "5500", notes: "" } };
    const created = new Date(createdAt);
    const [row] = (
      await db.query(
        `INSERT INTO orders (access_token, contact_name, contact_email, delivery, status, subtotal_minor, shipping_minor, idempotency_key, expires_at, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10) RETURNING id, number`,
        ["t".repeat(32), name, email, JSON.stringify(delivery), status, subtotal, shipping, `list-test-${++counter}-key`, new Date(created.getTime() + 15 * 60000), created],
      )
    ).rows;
    return { id: row.id, number: Number(row.number) };
  }
  return { db, repo, insert };
}

const DEFAULTS = { query: "", status: undefined, payment: undefined, delivery: undefined, from: undefined, to: undefined, sort: "recientes", page: 1 };

describe("order list URL search", () => {
  it("parses every filter and round-trips through the query string", () => {
    const search = parseOrderSearch({
      q: " SUB-1010 ",
      estado: "paid",
      pago: "pagado",
      entrega: "sin-enviar",
      desde: "2026-11-01",
      hasta: "2026-11-30",
      orden: "total-desc",
      pagina: "2",
    });
    assert.deepEqual(search, {
      query: "SUB-1010",
      status: "paid",
      payment: "pagado",
      delivery: "sin-enviar",
      from: "2026-11-01",
      to: "2026-11-30",
      sort: "total-desc",
      page: 2,
    });
    const query = orderSearchToQuery(search);
    assert.equal(query, "?q=SUB-1010&estado=paid&pago=pagado&entrega=sin-enviar&desde=2026-11-01&hasta=2026-11-30&orden=total-desc&pagina=2");
    assert.deepEqual(parseOrderSearch(Object.fromEntries(new URLSearchParams(query.slice(1)))), search);
    assert.equal(orderSearchToQuery(search, { page: 1, payment: undefined }), "?q=SUB-1010&estado=paid&entrega=sin-enviar&desde=2026-11-01&hasta=2026-11-30&orden=total-desc");
  });

  it("ignores invalid values and omits defaults", () => {
    const search = parseOrderSearch({
      estado: "lost",
      pago: "gratis",
      entrega: "volando",
      desde: "2026-02-30",
      hasta: "ayer",
      orden: "precio",
      pagina: "-1",
      q: ["  ana ", "otra"],
    });
    assert.deepEqual(search, { ...DEFAULTS, query: "ana" });
    assert.equal(orderSearchToQuery(parseOrderSearch({})), "");
    assert.equal(orderSearchToQuery(parseOrderSearch({ orden: "recientes", pagina: "1" })), "");
  });

  it("says when any filter is active", () => {
    assert.equal(hasActiveOrderFilters(parseOrderSearch({})), false);
    assert.equal(hasActiveOrderFilters(parseOrderSearch({ orden: "antiguos", pagina: "3" })), false);
    for (const params of [{ q: "ana" }, { estado: "paid" }, { pago: "pendiente" }, { entrega: "enviado" }, { desde: "2026-11-01" }, { hasta: "2026-11-01" }]) {
      assert.equal(hasActiveOrderFilters(parseOrderSearch(params)), true, JSON.stringify(params));
    }
  });
});

describe("searchOrders (PGlite)", () => {
  let ctx;
  const o = {};
  const numbers = (result) => result.items.map((order) => order.number);
  const find = (params) => ctx.repo.searchOrders(parseOrderSearch(params));

  before(async () => {
    ctx = await freshDb();
    // Created in this order: numbers 1001..1006.
    o.a = await ctx.insert({ name: "Ana Pérez", email: "ana@example.com", createdAt: "2026-11-10T12:00:00Z" });
    // 23:30 ART on 10/11.
    o.b = await ctx.insert({ name: "Bruno 100% Díaz", email: "bruno@Example.com", status: "paid", method: "shipping", city: "Godoy Cruz", subtotal: 300000, shipping: 50000, createdAt: "2026-11-11T02:30:00Z" });
    // 00:30 ART on 11/11.
    o.c = await ctx.insert({ name: "Carla", email: "carla@example.com", status: "paid", subtotal: 200000, createdAt: "2026-11-11T03:30:00Z" });
    o.d = await ctx.insert({ name: "Darío", email: "dario@example.com", status: "shipped", method: "shipping", subtotal: 50000, createdAt: "2026-11-12T12:00:00Z" });
    o.e = await ctx.insert({ name: "Eva", email: "eva@example.com", status: "needs_review", subtotal: 150000, createdAt: "2026-11-13T12:00:00Z" });
    o.f = await ctx.insert({ name: "Fede", email: "fede@example.com", status: "fulfilled", method: "shipping", subtotal: 120000, createdAt: "2026-11-09T12:00:00Z" });
  });
  after(() => ctx.db.close());

  it("lists newest first with totals and pages", async () => {
    const result = await find({});
    assert.deepEqual(numbers(result), [o.e, o.d, o.c, o.b, o.a, o.f].map((x) => x.number));
    assert.deepEqual({ total: result.total, page: result.page, pageSize: result.pageSize, pages: result.pages }, { total: 6, page: 1, pageSize: 50, pages: 1 });
    assert.equal(result.items[0].id, o.e.id);
  });

  it("finds by order number, with or without SUB-", async () => {
    assert.deepEqual(numbers(await find({ q: `SUB-${o.b.number}` })), [o.b.number]);
    assert.deepEqual(numbers(await find({ q: `sub-${o.b.number}` })), [o.b.number]);
    assert.deepEqual(numbers(await find({ q: String(o.b.number) })), [o.b.number]);
  });

  it("finds by contact name or email, case-insensitive, with LIKE wildcards taken literally", async () => {
    assert.deepEqual(numbers(await find({ q: "ana pé" })), [o.a.number]);
    assert.deepEqual(numbers(await find({ q: "BRUNO@EXAMPLE" })), [o.b.number]);
    assert.equal((await find({ q: "example.com" })).total, 6);
    assert.deepEqual(numbers(await find({ q: "%" })), [o.b.number]);
    assert.deepEqual(numbers(await find({ q: "_" })), []);
  });

  it("filters by payment, delivery (with its method) and exact status", async () => {
    assert.deepEqual(numbers(await find({ pago: "pendiente" })), [o.a.number]);
    assert.deepEqual(numbers(await find({ pago: "pagado" })), [o.d, o.c, o.b, o.f].map((x) => x.number));
    assert.deepEqual(numbers(await find({ pago: "revision" })), [o.e.number]);
    assert.deepEqual(numbers(await find({ entrega: "sin-enviar" })), [o.b.number]);
    assert.deepEqual(numbers(await find({ entrega: "para-retirar" })), [o.c.number]);
    assert.deepEqual(numbers(await find({ entrega: "enviado" })), [o.d.number]);
    assert.deepEqual(numbers(await find({ entrega: "entregado" })), [o.f.number]);
    assert.deepEqual(numbers(await find({ estado: "paid" })), [o.c.number, o.b.number]);
  });

  it("combines every filter with AND", async () => {
    assert.deepEqual(numbers(await find({ pago: "pagado", entrega: "para-retirar" })), [o.c.number]);
    assert.deepEqual(numbers(await find({ estado: "pending_payment", pago: "pagado" })), []);
    assert.deepEqual(numbers(await find({ estado: "paid", q: "bruno" })), [o.b.number]);
    assert.deepEqual(numbers(await find({ pago: "pagado", hasta: "2026-11-10" })), [o.b.number, o.f.number]);
  });

  it("reads Desde/Hasta as whole Argentina days (UTC−3)", async () => {
    // 23:30 ART of "hasta" is in; 00:30 ART of the next day is out.
    assert.deepEqual(numbers(await find({ hasta: "2026-11-10" })), [o.b, o.a, o.f].map((x) => x.number));
    assert.deepEqual(numbers(await find({ desde: "2026-11-11" })), [o.e, o.d, o.c].map((x) => x.number));
    assert.deepEqual(numbers(await find({ desde: "2026-11-10", hasta: "2026-11-10" })), [o.b, o.a].map((x) => x.number));
  });

  it("sorts by oldest and by total (products − discounts + shipping)", async () => {
    assert.deepEqual(numbers(await find({ orden: "antiguos" })), [o.f, o.a, o.b, o.c, o.d, o.e].map((x) => x.number));
    assert.deepEqual(numbers(await find({ orden: "total-desc" })), [o.b, o.c, o.e, o.f, o.a, o.d].map((x) => x.number));
    assert.deepEqual(numbers(await find({ orden: "total-asc" })), [o.d, o.a, o.f, o.e, o.c, o.b].map((x) => x.number));
  });

  it("counts paid orders waiting to ship or to be picked up", async () => {
    assert.deepEqual(await ctx.repo.countToDeliver(), { shipping: 1, pickup: 1 });
  });

  it("keeps listOrders and countByStatus as they were", async () => {
    const paid = await ctx.repo.listOrders({ status: "paid", limit: 10 });
    assert.deepEqual(paid.map((order) => order.number), [o.c.number, o.b.number]);
    assert.equal((await ctx.repo.listOrders({ limit: 2 })).length, 2);
    assert.deepEqual(await ctx.repo.countByStatus(), {
      pending_payment: 1,
      paid: 2,
      shipped: 1,
      fulfilled: 1,
      cancelled: 0,
      expired: 0,
      needs_review: 1,
    });
  });
});

describe("searchOrders pagination (PGlite)", () => {
  let ctx;
  before(async () => {
    ctx = await freshDb();
    const start = Date.parse("2026-10-01T12:00:00Z");
    for (let i = 0; i < 56; i++) {
      await ctx.insert({ name: `Cliente ${i}`, email: `c${i}@example.com`, createdAt: new Date(start + i * 3600000).toISOString() });
    }
  });
  after(() => ctx.db.close());

  it("pages by 50 with the total, and clamps a page past the end", async () => {
    const first = await ctx.repo.searchOrders(parseOrderSearch({}));
    assert.deepEqual({ n: first.items.length, total: first.total, pages: first.pages, page: first.page }, { n: 50, total: 56, pages: 2, page: 1 });
    const second = await ctx.repo.searchOrders(parseOrderSearch({ pagina: "2" }));
    assert.equal(second.items.length, 6);
    assert.equal(second.items.at(-1).contactName, "Cliente 0");
    const past = await ctx.repo.searchOrders(parseOrderSearch({ pagina: "9" }));
    assert.equal(past.page, 2);
    assert.equal(past.items.length, 6);
  });
});

describe("bulk Marcar entregado (PGlite)", () => {
  let ctx;
  before(async () => {
    ctx = await freshDb();
  });
  after(() => ctx.db.close());

  const status = async (id) => (await ctx.db.query("SELECT status FROM orders WHERE id = $1", [id])).rows[0].status;

  it("fulfills paid pickups and shipped orders, and skips the rest with the reason", async () => {
    const pickup = await ctx.insert({ name: "Ana", email: "ana@example.com", status: "paid", createdAt: "2026-11-10T12:00:00Z" });
    const shipped = await ctx.insert({ name: "Beto", email: "beto@example.com", status: "shipped", method: "shipping", createdAt: "2026-11-10T13:00:00Z" });
    const toShip = await ctx.insert({ name: "Caro", email: "caro@example.com", status: "paid", method: "shipping", createdAt: "2026-11-10T14:00:00Z" });
    const pending = await ctx.insert({ name: "Dani", email: "dani@example.com", createdAt: "2026-11-10T15:00:00Z" });
    const unknown = "00000000-0000-4000-8000-000000000000";

    const result = await fulfillOrders(ctx.repo, "admin@example.com", [pickup.id, shipped.id, toShip.id, pending.id, unknown, pickup.id]);
    assert.deepEqual(result.changed, [
      { id: pickup.id, number: `SUB-${pickup.number}` },
      { id: shipped.id, number: `SUB-${shipped.number}` },
    ]);
    assert.deepEqual(result.skipped, [
      { id: toShip.id, number: `SUB-${toShip.number}`, reason: "Primero marcá el pedido como enviado (con el seguimiento)." },
      { id: pending.id, number: `SUB-${pending.number}`, reason: "Solo se entregan pedidos pagados o enviados." },
      { id: unknown, number: null, reason: "El pedido no existe." },
    ]);
    assert.equal(await status(pickup.id), "fulfilled");
    assert.equal(await status(shipped.id), "fulfilled");
    assert.equal(await status(toShip.id), "paid");
    assert.equal(await status(pending.id), "pending_payment");

    // The existing transition wrote the history (once per order, despite the duplicate id).
    const events = (await ctx.db.query("SELECT order_id, from_status, to_status, actor, note FROM order_events ORDER BY id")).rows;
    assert.deepEqual(events, [
      { order_id: pickup.id, from_status: "paid", to_status: "fulfilled", actor: "admin@example.com", note: "Retirado en el taller." },
      { order_id: shipped.id, from_status: "shipped", to_status: "fulfilled", actor: "admin@example.com", note: "Pedido entregado." },
    ]);

    assert.deepEqual(fulfillResultMessage(result), {
      message: `2 pedidos marcados como entregados. 3 no se pudieron: SUB-${toShip.number} (Primero marcá el pedido como enviado (con el seguimiento)); SUB-${pending.number} (Solo se entregan pedidos pagados o enviados); un pedido que ya no existe.`,
      tone: "warning",
    });
  });

  it("refuses more than 50 different orders", async () => {
    assert.equal(MAX_BULK_ORDERS, 50);
    const ids = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    await assert.rejects(fulfillOrders(ctx.repo, "admin@example.com", ids), (error) => error instanceof RangeError && error.message === "Podés cambiar hasta 50 pedidos por vez.");
    // 50 different ids (plus a repeat) are fine.
    const result = await fulfillOrders(ctx.repo, "admin@example.com", [...ids.slice(0, 50), ids[0]]);
    assert.equal(result.skipped.length, 50);
  });

  it("validates what the browser sends", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    assert.deepEqual(parseFulfillInput({ ids: [id, id.toUpperCase(), id] }), { ok: true, ids: [id] });
    assert.deepEqual(parseFulfillInput({ ids: [] }), { ok: false, error: "Elegí al menos un pedido." });
    assert.deepEqual(parseFulfillInput({ ids: ["nope"] }), { ok: false, error: "Elegí al menos un pedido." });
    assert.deepEqual(parseFulfillInput(null), { ok: false, error: "Elegí al menos un pedido." });
    const many = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    assert.deepEqual(parseFulfillInput({ ids: many }), { ok: false, error: "Podés cambiar hasta 50 pedidos por vez." });
  });

  it("words the result for one order and for none", () => {
    assert.deepEqual(fulfillResultMessage({ changed: [{ id: "x", number: "SUB-1" }], skipped: [] }), { message: "1 pedido marcado como entregado.", tone: "success" });
    assert.deepEqual(fulfillResultMessage({ changed: [], skipped: [{ id: "x", number: "SUB-2", reason: "Solo se entregan pedidos pagados o enviados." }] }), {
      message: "Ningún pedido marcado como entregado. 1 no se pudo: SUB-2 (Solo se entregan pedidos pagados o enviados).",
      tone: "critical",
    });
  });
});
