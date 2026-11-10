// Mercado Pago webhook: signature check and payment reconciliation against real orders (PGlite).
// Acceptance (auditoría v1.1): aprobado, rechazado, duplicado, inválido, tardío y pendiente.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createOrderRepository } from "../src/server/orders/repository.ts";
import { MercadoPagoError } from "../src/server/payments/mercadopago.ts";
import { reconcilePendingPayments } from "../src/server/payments/reconcile.ts";
import { createPaymentRepository, reconcilePayment, verifyWebhookSignature } from "../src/server/payments/webhook.ts";

const secret = "webhook-secret";
const sign = (manifest, key = secret) => createHmac("sha256", key).update(manifest).digest("hex");

describe("webhook signature", () => {
  const ts = "1704908010";
  const header = (v1) => `ts=${ts},v1=${v1}`;
  const manifest = `id:123456;request-id:req-1;ts:${ts};`;

  it("accepts Mercado Pago's HMAC-SHA256 over id, request id and ts", () => {
    assert.equal(verifyWebhookSignature({ signature: header(sign(manifest)), requestId: "req-1", dataId: "123456", secret }), true);
  });

  it("rejects a tampered id, another secret or a malformed header", () => {
    assert.equal(verifyWebhookSignature({ signature: header(sign(manifest)), requestId: "req-1", dataId: "999", secret }), false);
    assert.equal(verifyWebhookSignature({ signature: header(sign(manifest, "other")), requestId: "req-1", dataId: "123456", secret }), false);
    assert.equal(verifyWebhookSignature({ signature: "garbage", requestId: "req-1", dataId: "123456", secret }), false);
    assert.equal(verifyWebhookSignature({ signature: null, requestId: "req-1", dataId: "123456", secret }), false);
  });

  it("lowercases alphanumeric ids and leaves out a missing request id", () => {
    assert.equal(verifyWebhookSignature({ signature: header(sign(`id:abc9;request-id:req-1;ts:${ts};`)), requestId: "req-1", dataId: "ABC9", secret }), true);
    assert.equal(verifyWebhookSignature({ signature: header(sign(`id:123456;ts:${ts};`)), requestId: null, dataId: "123456", secret }), true);
  });

  it("accepts Orders API ids signed lowercase or as sent", () => {
    const id = "ORD01JQ4S4KY8HWQ6NA5PXB65B3D3";
    assert.equal(verifyWebhookSignature({ signature: header(sign(`id:${id.toLowerCase()};request-id:req-1;ts:${ts};`)), requestId: "req-1", dataId: id, secret }), true);
    assert.equal(verifyWebhookSignature({ signature: header(sign(`id:${id};request-id:req-1;ts:${ts};`)), requestId: "req-1", dataId: id, secret }), true);
    assert.equal(verifyWebhookSignature({ signature: header(sign(`id:ord999;request-id:req-1;ts:${ts};`)), requestId: "req-1", dataId: id, secret }), false);
  });
});

describe("payment reconciliation (PGlite)", () => {
  let db;
  let orders;
  let payments;
  let counter = 0;
  const migrations = join(import.meta.dirname, "..", "db");
  const files = (folder) =>
    readdirSync(join(migrations, folder))
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => readFileSync(join(migrations, folder, name), "utf8"));

  before(async () => {
    db = new PGlite();
    for (const sql of [...files("migrations"), ...files("seed")]) await db.exec(sql);
    const query = { query: async (text, params) => (await db.query(text, params)).rows };
    orders = createOrderRepository(query);
    payments = createPaymentRepository(query);
  });
  after(() => db.close());
  beforeEach(() => db.exec("UPDATE inventory SET on_hand = 5, reserved = 0 FROM product_variants v WHERE v.id = inventory.variant_id AND v.sku = 'SUB-P08'"));

  const placeOrder = async (quantity = 1) => {
    const { id } = await orders.placeOrder({
      contactName: "Ana Pérez",
      contactEmail: "ana@example.com",
      contactPhone: "",
      delivery: { method: "pickup" },
      notes: "",
      shipping: { method: "pickup", costMinor: 0, label: "Retiro", ruleId: null, free: false, etaMinDays: null, etaMaxDays: null },
      idempotencyKey: `webhook-test-${++counter}-key`,
      customerId: null,
      lines: [{ sku: "SUB-P08", productId: "p08", name: "Pack", quantity, unitPriceMinor: 890000 }],
    });
    return id;
  };

  // A Mercado Pago order (Orders API), as GET /v1/orders/{id} reports it.
  const paymentFor = (orderId, overrides = {}) => ({
    id: `ORDTST01K${String(++counter).padStart(6, "0")}`,
    status: "processed",
    statusDetail: "accredited",
    externalReference: orderId,
    paidAmountMinor: 890000,
    currency: "ARS",
    ...overrides,
  });

  const run = (payment) => reconcilePayment({ getOrder: async () => payment, orders, payments }, payment.id);
  const status = async (id) => (await orders.getOrder(id)).status;
  const recorded = async (paymentId) => (await db.query("SELECT status, order_id FROM payments WHERE external_id = $1", [paymentId])).rows[0];

  it("aprobado (processed): confirms the order with Mercado Pago as the actor", async () => {
    const orderId = await placeOrder();
    const payment = paymentFor(orderId);
    assert.equal(await run(payment), "paid");
    assert.equal(await status(orderId), "paid");
    const [event] = (await db.query("SELECT actor, note FROM order_events WHERE order_id = $1 AND to_status = 'paid'", [orderId])).rows;
    assert.equal(event.actor, "mercadopago");
    assert.match(event.note, new RegExp(payment.id));
    assert.deepEqual(await recorded(payment.id), { status: "processed", order_id: orderId });
  });

  it("duplicado: the same notification twice confirms once", async () => {
    const orderId = await placeOrder();
    const payment = paymentFor(orderId);
    assert.equal(await run(payment), "paid");
    assert.equal(await run(payment), "duplicate");
    const [{ n }] = (await db.query("SELECT count(*)::int AS n FROM order_events WHERE order_id = $1 AND to_status = 'paid'", [orderId])).rows;
    assert.equal(n, 1);
  });

  it("a second, different approved payment for a paid order is flagged (double charge)", async () => {
    const orderId = await placeOrder();
    assert.equal(await run(paymentFor(orderId)), "paid");
    assert.equal(await run(paymentFor(orderId)), "conflict");
    assert.equal(await status(orderId), "paid");
  });

  it("rechazado and pendiente: recorded, the order stays pending", async () => {
    const orderId = await placeOrder();
    const rejected = paymentFor(orderId, { status: "failed", statusDetail: "rejected_by_issuer", paidAmountMinor: 0 });
    assert.equal(await run(rejected), "recorded");
    const pending = paymentFor(orderId, { status: "action_required", statusDetail: "waiting_payment", paidAmountMinor: 0 });
    assert.equal(await run(pending), "recorded");
    assert.equal(await status(orderId), "pending_payment");
    assert.equal((await recorded(rejected.id)).status, "failed");
  });

  it("an update of the same payment overwrites its status", async () => {
    const orderId = await placeOrder();
    const payment = paymentFor(orderId, { status: "action_required", paidAmountMinor: 0 });
    await run(payment);
    assert.equal(await run({ ...payment, status: "processed", paidAmountMinor: 890000 }), "paid");
    assert.equal((await recorded(payment.id)).status, "processed");
  });

  it("tardío: a payment after the reservation expired still sells when stock is free", async () => {
    const orderId = await placeOrder();
    await db.query("UPDATE stock_reservations SET expires_at = now() - interval '1 minute' WHERE order_id = $1", [orderId]);
    await orders.releaseExpired();
    assert.equal(await status(orderId), "expired");
    assert.equal(await run(paymentFor(orderId)), "paid");
    assert.equal(await status(orderId), "paid");
  });

  it("tardío without stock goes to needs_review", async () => {
    const orderId = await placeOrder(5);
    await db.query("UPDATE stock_reservations SET expires_at = now() - interval '1 minute' WHERE order_id = $1", [orderId]);
    await orders.releaseExpired();
    await placeOrder(5);
    assert.equal(await run(paymentFor(orderId, { paidAmountMinor: 5 * 890000 })), "needs_review");
  });

  it("inválido: wrong amount or currency never confirms", async () => {
    const orderId = await placeOrder();
    assert.equal(await run(paymentFor(orderId, { paidAmountMinor: 100 })), "mismatch");
    assert.equal(await run(paymentFor(orderId, { currency: "USD" })), "mismatch");
    assert.equal(await status(orderId), "pending_payment");
  });

  it("inválido: unknown or foreign references are ignored", async () => {
    assert.equal(await run(paymentFor("not-an-order")), "ignored");
    assert.equal(await run(paymentFor("6b0c2f9a-0000-4000-8000-000000000000")), "ignored");
  });

  it("an approved payment for a cancelled order is flagged, not applied", async () => {
    const orderId = await placeOrder();
    await orders.cancelOrder("admin@example.com", orderId, "Cliente desistió");
    assert.equal(await run(paymentFor(orderId)), "conflict");
    assert.equal(await status(orderId), "cancelled");
  });

  describe("periodic check when a notice is lost", () => {
    const age = (paymentId, interval, column = "updated_at") =>
      db.query(`UPDATE payments SET ${column} = now() - $2::interval WHERE external_id = $1`, [paymentId, interval]);
    // A started checkout nobody heard from for a few minutes.
    const started = async (orderId, quiet = "5 minutes") => {
      const id = `ORDTST02K${String(++counter).padStart(6, "0")}`;
      await payments.recordStarted(id, orderId);
      await age(id, quiet);
      return id;
    };
    const check = (states, calls = []) =>
      reconcilePendingPayments(
        {
          getOrder: async (id) => {
            calls.push(id);
            const state = states[id];
            if (state instanceof Error) throw state;
            if (!state) throw new Error(`unexpected check of ${id}`);
            return state;
          },
          orders,
          payments,
        },
        50,
      );

    it("a started checkout is recorded without overwriting what a notice already reported", async () => {
      const orderId = await placeOrder();
      await payments.recordStarted("ORDTST03A", orderId);
      assert.deepEqual(await recorded("ORDTST03A"), { status: "created", order_id: orderId });
      await run({ ...paymentFor(orderId), id: "ORDTST03B", status: "action_required", paidAmountMinor: 0 });
      await payments.recordStarted("ORDTST03B", orderId);
      assert.equal((await recorded("ORDTST03B")).status, "action_required");
    });

    it("confirms a paid checkout whose notice never arrived (SUB-1005)", async () => {
      const orderId = await placeOrder();
      const id = await started(orderId);
      const summary = await check({ [id]: { ...paymentFor(orderId), id } });
      assert.deepEqual(summary, { checked: 1, confirmed: 1, failed: 0 });
      assert.equal(await status(orderId), "paid");
      assert.deepEqual(await recorded(id), { status: "processed", order_id: orderId });
    });

    it("a lost notice after the reservation expired still confirms (tardío)", async () => {
      const orderId = await placeOrder();
      const id = await started(orderId);
      await db.query("UPDATE stock_reservations SET expires_at = now() - interval '1 minute' WHERE order_id = $1", [orderId]);
      await orders.releaseExpired();
      assert.deepEqual(await check({ [id]: { ...paymentFor(orderId), id } }), { checked: 1, confirmed: 1, failed: 0 });
      assert.equal(await status(orderId), "paid");
    });

    it("checks only quiet, recent, unfinished checkouts of orders still awaiting payment", async () => {
      const waiting = await placeOrder();
      const due = await started(waiting);
      const tooRecent = await started(waiting, "30 seconds");
      const tooOld = await started(waiting);
      await age(tooOld, "25 hours", "created_at");
      const finished = await started(waiting);
      await run({ ...paymentFor(waiting), id: finished, status: "expired", paidAmountMinor: 0 });
      await age(finished, "5 minutes");
      const cancelledOrder = await placeOrder();
      const ofCancelled = await started(cancelledOrder);
      await orders.cancelOrder("admin@example.com", cancelledOrder, "Cliente desistió");

      const calls = [];
      const summary = await check({ [due]: { ...paymentFor(waiting), id: due, status: "action_required", paidAmountMinor: 0 } }, calls);
      assert.deepEqual(calls, [due]);
      assert.deepEqual(summary, { checked: 1, confirmed: 0, failed: 0 });
      assert.equal(await status(waiting), "pending_payment");
      // Just checked: it waits for the next quiet window.
      assert.deepEqual(await check({}), { checked: 0, confirmed: 0, failed: 0 });
      assert.ok(ofCancelled && tooRecent);
    });

    it("an unreachable Mercado Pago never stops the others and waits before retrying; an unknown order stops being checked", async () => {
      const first = await placeOrder();
      const down = await started(first, "7 minutes");
      const second = await placeOrder();
      const missing = await started(second, "6 minutes");
      const third = await placeOrder();
      const paid = await started(third);
      const summary = await check({
        [down]: new MercadoPagoError(503, "unreachable"),
        [missing]: new MercadoPagoError(404, "not_found"),
        [paid]: { ...paymentFor(third), id: paid },
      });
      assert.deepEqual(summary, { checked: 3, confirmed: 1, failed: 2 });
      assert.equal(await status(third), "paid");
      assert.equal((await recorded(missing)).status, "not_found");
      assert.equal((await recorded(down)).status, "created");
      assert.deepEqual(await check({}), { checked: 0, confirmed: 0, failed: 0 });
    });
  });
});
