// Customer profile (stage 4, T3): the pure rules of the profile page and the
// read-only queries behind "Actividad reciente" and "Con el mismo email, sin
// cuenta" (PGlite). Nothing here links, merges or changes a customer.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  activityTimelineEntries,
  argentinaDate,
  contactDiffers,
  phoneHref,
  requestStatusTone,
  reviewCountText,
} from "../src/components/admin/customers/profile-helpers.ts";
import { customerActivity, guestMatches, reviewOrderCount } from "../src/server/customers/profile.ts";

describe("customer profile helpers", () => {
  it("flags an encargo contact email that differs from the account email, ignoring case and spaces", () => {
    assert.equal(contactDiffers("ana@example.com", "ana@example.com"), false);
    assert.equal(contactDiffers(" ANA@Example.com ", "ana@example.com"), false);
    assert.equal(contactDiffers("beto@example.com", "ana@example.com"), true);
  });

  it("words the needs_review count without adding it to the total", () => {
    assert.equal(reviewCountText(0), null);
    assert.equal(reviewCountText(1), "1 pago en revisión (no sumado)");
    assert.equal(reviewCountText(3), "3 pagos en revisión (no sumados)");
  });

  it("shows dates as dd/mm/aaaa in Argentina time", () => {
    // 02:30 UTC is still the previous day in Argentina (UTC−3).
    assert.equal(argentinaDate(new Date("2026-11-02T02:30:00Z")), "01/11/2026");
    assert.equal(argentinaDate(new Date("2026-11-02T15:00:00Z")), "02/11/2026");
  });

  it("builds a tel: link only when the phone has digits", () => {
    assert.equal(phoneHref("261 555-1234"), "tel:2615551234");
    assert.equal(phoneHref("+54 9 261 555"), "tel:+549261555");
    assert.equal(phoneHref("sin número"), null);
    assert.equal(phoneHref(null), null);
  });

  it("gives every encargo status a tone", () => {
    assert.equal(requestStatusTone("received"), "attention");
    assert.equal(requestStatusTone("quoted"), "info");
    assert.equal(requestStatusTone("delivered"), "success");
    assert.equal(requestStatusTone("declined"), "neutral");
    assert.equal(requestStatusTone("cancelled"), "neutral");
    assert.equal(requestStatusTone("in_production"), "info");
    assert.equal(requestStatusTone("accepted"), "success");
  });

  it("maps order and encargo events to timeline entries with code, status label, link and readable actor", () => {
    const at = new Date("2026-11-03T10:00:00Z");
    const entries = activityTimelineEntries(
      [
        { kind: "order", recordId: "o1", number: 1001, toStatus: "paid", actor: "mercadopago", note: "Pago aprobado", method: "pickup", createdAt: at },
        { kind: "request", recordId: "r1", number: 5001, toStatus: "received", actor: "cliente", note: "", method: null, createdAt: at },
        { kind: "order", recordId: "o2", number: 1002, toStatus: "mystery", actor: "admin@example.com", note: "", method: "shipping", createdAt: at },
      ],
      { order: { paid: "Pagado" }, request: { received: "Recibido" } },
    );
    assert.deepEqual(
      entries.map(({ code, label, href, actor, note, tone }) => ({ code, label, href, actor, note, tone })),
      [
        { code: "SUB-1001", label: "Pagado", href: "/admin/pedidos/o1", actor: "Mercado Pago", note: "Pago aprobado", tone: "success" },
        { code: "ENC-5001", label: "Recibido", href: "/admin/encargos/r1", actor: "Cliente", note: "", tone: "attention" },
        { code: "SUB-1002", label: "mystery", href: "/admin/pedidos/o2", actor: "admin@example.com", note: "", tone: "neutral" },
      ],
    );
    assert.equal(new Set(entries.map((entry) => entry.id)).size, 3);
    assert.equal(entries[0].time, at);
  });
});

const migrations = () =>
  readdirSync(join("db", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join("db", "migrations", name), "utf8"));

describe("customer profile queries (PGlite)", () => {
  let db;
  let sql;
  let ana;
  let beto;
  let seq = 0;

  async function order(customerId, email, status, at, method = "pickup") {
    seq++;
    const delivery =
      method === "shipping"
        ? { method, address: { recipient: "Ana", street: "Calle", streetNumber: "1", city: "Mendoza", province: "Mendoza", postalCode: "5500" } }
        : { method };
    const [row] = (
      await db.query(
        `INSERT INTO orders (access_token, customer_id, contact_name, contact_email, delivery, status, subtotal_minor, idempotency_key, expires_at, created_at)
         VALUES ($1, $2, 'Ana Pérez', $3, $4, $5, 1000, $6, now(), $7) RETURNING id, number`,
        ["t".repeat(32), customerId, email, JSON.stringify(delivery), status, `order-key-${seq}`, at],
      )
    ).rows;
    return row;
  }

  async function request(customerId, email, at, status = "received") {
    seq++;
    const [row] = (
      await db.query(
        `INSERT INTO custom_requests (access_token, customer_id, contact_name, contact_email, product_type, quantity, idea, idempotency_key, status, quote_minor, created_at)
         VALUES ($1, $2, 'Quien pidió', $3, 'Stickers', 50, 'Una idea con suficiente detalle para el encargo.', $4, $5, $6, $7) RETURNING id, number`,
        ["t".repeat(32), customerId, email, `request-key-${seq}`, status, status === "received" ? null : 5000, at],
      )
    ).rows;
    return row;
  }

  const event = (table, column, id, to, actor, note, at) =>
    db.query(`INSERT INTO ${table} (${column}, from_status, to_status, actor, note, created_at) VALUES ($1, NULL, $2, $3, $4, $5)`, [id, to, actor, note, at]);

  before(async () => {
    db = new PGlite();
    for (const text of migrations()) await db.exec(text);
    sql = { query: async (text, params) => (await db.query(text, params)).rows };

    await db.query("INSERT INTO auth_users (id, name, email) VALUES ('u-ana', 'Ana', 'ana@example.com'), ('u-beto', 'Beto', 'beto@example.com')");
    ana = (await db.query("INSERT INTO customers (auth_user_id, email, full_name) VALUES ('u-ana', 'ana@example.com', 'Ana') RETURNING id")).rows[0].id;
    beto = (await db.query("INSERT INTO customers (auth_user_id, email, full_name) VALUES ('u-beto', 'beto@example.com', 'Beto') RETURNING id")).rows[0].id;
  });

  after(() => db?.close());

  it("lists only this customer's order and encargo events, newest first, limited", async () => {
    const anaOrder = await order(ana, "ana@example.com", "paid", "2026-11-01T10:00:00Z", "shipping");
    const anaRequest = await request(ana, "otra@example.com", "2026-11-02T10:00:00Z");
    const betoOrder = await order(beto, "beto@example.com", "paid", "2026-11-01T11:00:00Z");
    const guestOrder = await order(null, "ana@example.com", "paid", "2026-11-01T12:00:00Z");

    await event("order_events", "order_id", anaOrder.id, "pending_payment", "checkout", "", "2026-11-01T10:00:00Z");
    await event("order_events", "order_id", anaOrder.id, "paid", "mercadopago", "Pago aprobado", "2026-11-01T10:30:00Z");
    await event("custom_request_events", "request_id", anaRequest.id, "received", "cliente", "Solicitud recibida.", "2026-11-02T10:00:00Z");
    await event("order_events", "order_id", betoOrder.id, "paid", "mercadopago", "", "2026-11-05T10:00:00Z");
    await event("order_events", "order_id", guestOrder.id, "paid", "mercadopago", "", "2026-11-06T10:00:00Z");

    const all = await customerActivity(sql, ana, 15);
    assert.deepEqual(
      all.map((row) => [row.kind, row.recordId, row.toStatus, row.createdAt.toISOString()]),
      [
        ["request", anaRequest.id, "received", "2026-11-02T10:00:00.000Z"],
        ["order", anaOrder.id, "paid", "2026-11-01T10:30:00.000Z"],
        ["order", anaOrder.id, "pending_payment", "2026-11-01T10:00:00.000Z"],
      ],
    );
    assert.equal(all[0].number, Number(anaRequest.number));
    assert.equal(all[0].method, null);
    assert.equal(all[1].number, Number(anaOrder.number));
    assert.equal(all[1].method, "shipping");
    assert.equal(all[1].actor, "mercadopago");
    assert.equal(all[1].note, "Pago aprobado");

    const limited = await customerActivity(sql, ana, 2);
    assert.deepEqual(
      limited.map((row) => row.toStatus),
      ["received", "paid"],
    );
  });

  it("finds guest orders and encargos with the same email (any case), never the account's own", async () => {
    const guestOrder = await order(null, "ANA@Example.com", "pending_payment", "2026-11-07T10:00:00Z");
    const guestRequest = await request(null, "ana@EXAMPLE.com", "2026-11-08T10:00:00Z", "quoted");
    await order(null, "otra@example.com", "paid", "2026-11-09T10:00:00Z");
    await request(null, "otra@example.com", "2026-11-09T10:00:00Z");

    const matches = await guestMatches(sql, "Ana@example.com", 20);
    // Two guest orders with ana's email (the one from the previous test too), newest first.
    assert.equal(matches.orders.length, 2);
    assert.equal(matches.orders[0].id, guestOrder.id);
    assert.equal(matches.orders[0].number, Number(guestOrder.number));
    assert.equal(matches.orders[0].status, "pending_payment");
    assert.equal(matches.orders[0].totalMinor, 1000);
    assert.equal(matches.orders[0].contactEmail, "ANA@Example.com");
    assert.ok(matches.orders.every((row) => row.contactEmail.toLowerCase() === "ana@example.com"));
    assert.deepEqual(
      matches.requests.map((row) => [row.id, row.number, row.status, row.productType, row.quantity]),
      [[guestRequest.id, Number(guestRequest.number), "quoted", "Stickers", 50]],
    );

    // Ana's own records (customer_id set) never appear here.
    const own = (await db.query("SELECT id FROM orders WHERE customer_id = $1", [ana])).rows.map((row) => row.id);
    assert.ok(matches.orders.every((row) => !own.includes(row.id)));

    assert.equal((await guestMatches(sql, "ana@example.com", 1)).orders.length, 1);
    assert.deepEqual(await guestMatches(sql, "nadie@example.com", 20), { orders: [], requests: [] });
  });

  it("counts the customer's needs_review orders apart", async () => {
    assert.equal(await reviewOrderCount(sql, ana), 0);
    await order(ana, "ana@example.com", "needs_review", "2026-11-10T10:00:00Z");
    await order(null, "ana@example.com", "needs_review", "2026-11-10T11:00:00Z");
    assert.equal(await reviewOrderCount(sql, ana), 1);
    assert.equal(await reviewOrderCount(sql, beto), 0);
  });
});
