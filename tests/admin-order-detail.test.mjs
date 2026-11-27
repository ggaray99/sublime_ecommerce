// Order detail page (stage 3, T4): the pure rules behind the timeline, the
// payment card, the products card and the action dialogs, plus the read-only
// Mercado Pago payments view (PGlite). The server action keeps its own
// validation (src/app/admin/pedidos/actions.ts, unchanged by T4).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  actorLabel,
  argentinaDateTime,
  lineOptionsText,
  mercadoPagoStatusLabel,
  orderActionsFor,
  orderTimelineEntries,
  paymentPreferenceLabel,
  reservationText,
  shippingCostLabel,
} from "../src/components/admin/orders/detail-helpers.ts";
import { listOrderPayments } from "../src/server/orders/payments-view.ts";
import { createOrderRepository } from "../src/server/orders/repository.ts";

const LABELS = {
  pending_payment: "Pendiente de pago",
  paid: "Pago confirmado",
  shipped: "Enviado",
  fulfilled: "Entregado",
  cancelled: "Cancelado",
  expired: "Vencido",
  needs_review: "En revisión",
};

describe("order timeline", () => {
  it("humanizes the actors and keeps admin emails as they are", () => {
    assert.equal(actorLabel("checkout"), "Checkout de la tienda");
    assert.equal(actorLabel("system"), "Sistema (vencimiento automático)");
    assert.equal(actorLabel("mercadopago"), "Mercado Pago");
    assert.equal(actorLabel("ana@example.com"), "ana@example.com");
  });

  it("lists events newest first with the target status, the previous one, the note and a tone", () => {
    const events = [
      { fromStatus: null, toStatus: "pending_payment", actor: "checkout", note: "", createdAt: new Date("2026-11-20T13:00:00Z") },
      { fromStatus: "pending_payment", toStatus: "paid", actor: "mercadopago", note: "Pago aprobado.", createdAt: new Date("2026-11-20T13:05:00Z") },
      { fromStatus: "paid", toStatus: "shipped", actor: "admin@example.com", note: "Enviado por Andreani.", createdAt: new Date("2026-11-21T10:00:00Z") },
    ];
    const entries = orderTimelineEntries(events, "shipping", LABELS);
    assert.deepEqual(
      entries.map(({ label, previousLabel, actor, note, tone }) => ({ label, previousLabel, actor, note, tone })),
      [
        { label: "Enviado", previousLabel: "Pago confirmado", actor: "admin@example.com", note: "Enviado por Andreani.", tone: "info" },
        { label: "Pago confirmado", previousLabel: "Pendiente de pago", actor: "Mercado Pago", note: "Pago aprobado.", tone: "success" },
        { label: "Pendiente de pago", previousLabel: null, actor: "Checkout de la tienda", note: "", tone: "warning" },
      ],
    );
    assert.equal(entries[0].time.toISOString(), "2026-11-21T10:00:00.000Z");
    assert.equal(new Set(entries.map((entry) => entry.id)).size, 3, "ids are unique");
    assert.equal(events[0].toStatus, "pending_payment", "the caller's array is not reordered");
  });

  it("tones review as critical, closed states as neutral, and keeps an unknown status readable", () => {
    const at = new Date("2026-11-20T13:00:00Z");
    const tones = orderTimelineEntries(
      [
        { fromStatus: "expired", toStatus: "needs_review", actor: "mercadopago", note: "", createdAt: at },
        { fromStatus: "pending_payment", toStatus: "cancelled", actor: "a@b.co", note: "Sin stock", createdAt: at },
        { fromStatus: "pending_payment", toStatus: "expired", actor: "system", note: "", createdAt: at },
        { fromStatus: "shipped", toStatus: "fulfilled", actor: "a@b.co", note: "", createdAt: at },
        { fromStatus: "legacy", toStatus: "legacy", actor: "a@b.co", note: "", createdAt: at },
      ],
      "pickup",
      LABELS,
    ).map((entry) => [entry.label, entry.previousLabel, entry.tone]);
    assert.deepEqual(tones, [
      ["legacy", "legacy", "neutral"],
      ["Entregado", "Enviado", "success"],
      ["Vencido", "Pendiente de pago", "neutral"],
      ["Cancelado", "Pendiente de pago", "neutral"],
      ["En revisión", "Vencido", "critical"],
    ]);
  });
});

describe("payment card", () => {
  it("names the customer's payment preference", () => {
    assert.equal(paymentPreferenceLabel("transfer"), "Transferencia");
    assert.equal(paymentPreferenceLabel("any"), "Mercado Pago o transferencia");
  });

  it("translates common Mercado Pago statuses and falls back to the raw value", () => {
    assert.equal(mercadoPagoStatusLabel("approved"), "Aprobado");
    assert.equal(mercadoPagoStatusLabel("processed"), "Aprobado");
    assert.equal(mercadoPagoStatusLabel("pending"), "Pendiente");
    assert.equal(mercadoPagoStatusLabel("in_process"), "En proceso");
    assert.equal(mercadoPagoStatusLabel("rejected"), "Rechazado");
    assert.equal(mercadoPagoStatusLabel("cancelled"), "Cancelado");
    assert.equal(mercadoPagoStatusLabel("refunded"), "Devuelto");
    assert.equal(mercadoPagoStatusLabel("weird_status"), "weird_status");
  });

  it("writes dates in Argentina time (UTC−3) and the reservation deadline as day/month and time", () => {
    assert.equal(argentinaDateTime(new Date("2026-11-27T02:30:00Z")), "26/11/2026 23:30");
    assert.equal(reservationText(new Date("2026-11-27T02:30:00Z")), "Reserva hasta 26/11 23:30");
  });
});

describe("products card", () => {
  it("shows options for regular lines and design lines, not for named combo lines", () => {
    assert.equal(lineOptionsText({ name: "Remera", designId: null, options: { Talle: "M", Color: "Negro" } }), "Talle M · Color Negro");
    assert.equal(lineOptionsText({ name: "Gato · Remera", designId: "d1", options: { Talle: "S" } }), "Talle S");
    assert.equal(lineOptionsText({ name: "Pack · Stickers", designId: null, options: { Tamaño: "5 cm" } }), null);
    assert.equal(lineOptionsText({ name: "Taza", designId: null, options: {} }), null);
  });

  it("keeps the shipping wording of the order summary", () => {
    const address = { recipient: "Ana", street: "X", streetNumber: "1", apartment: "", city: "C", province: "P", postalCode: "1000", notes: "" };
    const shipping = { method: "shipping", address };
    assert.equal(shippingCostLabel({ shippingMinor: null, delivery: shipping, shipping: null }), "A confirmar");
    assert.equal(shippingCostLabel({ shippingMinor: null, delivery: { method: "pickup" }, shipping: null }), "Sin cargo");
    assert.equal(shippingCostLabel({ shippingMinor: 0, delivery: shipping, shipping: { free: true } }), "Gratis");
    assert.equal(shippingCostLabel({ shippingMinor: 0, delivery: { method: "pickup" }, shipping: { free: false } }), "Sin cargo");
    assert.equal(shippingCostLabel({ shippingMinor: 350000, delivery: shipping, shipping: { free: false } }), null);
  });
});

describe("order actions", () => {
  // Same availability as the previous OrderActions (existing behavior kept).
  it("offers the same actions per status and delivery method as before", () => {
    const intents = (status, method) => orderActionsFor(status, method).map((action) => `${action.intent}:${action.label}`);
    assert.deepEqual(intents("pending_payment", "shipping"), ["confirm:Confirmar pago", "cancel:Cancelar pedido"]);
    assert.deepEqual(intents("expired", "pickup"), ["confirm:Confirmar pago tardío", "cancel:Cancelar pedido"]);
    assert.deepEqual(intents("needs_review", "shipping"), ["cancel:Cancelar pedido"]);
    assert.deepEqual(intents("paid", "shipping"), ["ship:Marcar enviado"]);
    assert.deepEqual(intents("paid", "pickup"), ["fulfill:Marcar entregado"]);
    assert.deepEqual(intents("shipped", "shipping"), ["fulfill:Marcar entregado"]);
    assert.deepEqual(intents("fulfilled", "shipping"), []);
    assert.deepEqual(intents("cancelled", "pickup"), []);
  });
});

describe("Mercado Pago payments of an order (PGlite)", () => {
  let db;
  let orders;
  let sql;
  let counter = 0;
  const root = join(import.meta.dirname, "..", "db");
  const files = (folder) =>
    readdirSync(join(root, folder))
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => readFileSync(join(root, folder, name), "utf8"));

  before(async () => {
    db = new PGlite();
    for (const text of [...files("migrations"), ...files("seed")]) await db.exec(text);
    sql = { query: async (text, params) => (await db.query(text, params)).rows };
    orders = createOrderRepository(sql);
  });
  after(() => db.close());

  const placeOrder = async () => {
    const { id } = await orders.placeOrder({
      contactName: "Ana Pérez",
      contactEmail: "ana@example.com",
      contactPhone: "",
      delivery: { method: "pickup" },
      notes: "",
      shipping: { method: "pickup", costMinor: 0, label: "Retiro", ruleId: null, free: false, etaMinDays: null, etaMaxDays: null },
      idempotencyKey: `detail-test-${++counter}-key`,
      customerId: null,
      lines: [{ sku: "SUB-P08", productId: "p08", name: "Pack", quantity: 1, unitPriceMinor: 890000 }],
    });
    return id;
  };
  const insertPayment = (externalId, orderId, status, amountMinor, createdAt) =>
    db.query(
      `INSERT INTO payments (provider, external_id, order_id, status, status_detail, amount_minor, currency, created_at, updated_at)
       VALUES ('mercadopago', $1, $2, $3, '', $4, 'ARS', $5, $5)`,
      [externalId, orderId, status, amountMinor, createdAt],
    );

  it("returns only that order's payments, newest first", async () => {
    const orderId = await placeOrder();
    const other = await placeOrder();
    await insertPayment("ORDOLD1", orderId, "rejected", 0, "2026-11-20T10:00:00Z");
    await insertPayment("ORDNEW1", orderId, "processed", 890000, "2026-11-20T11:00:00Z");
    await insertPayment("ORDOTHER1", other, "processed", 890000, "2026-11-20T12:00:00Z");

    const payments = await listOrderPayments(sql, orderId);
    assert.deepEqual(
      payments.map(({ externalId, status, amountMinor, currency }) => ({ externalId, status, amountMinor, currency })),
      [
        { externalId: "ORDNEW1", status: "processed", amountMinor: 890000, currency: "ARS" },
        { externalId: "ORDOLD1", status: "rejected", amountMinor: 0, currency: "ARS" },
      ],
    );
    assert.ok(payments[0].createdAt instanceof Date);
    assert.equal(payments[0].createdAt.toISOString(), "2026-11-20T11:00:00.000Z");
  });

  it("returns an empty list for an order without payments or an invalid id", async () => {
    assert.deepEqual(await listOrderPayments(sql, await placeOrder()), []);
    assert.deepEqual(await listOrderPayments(sql, "not-a-uuid"), []);
  });
});
