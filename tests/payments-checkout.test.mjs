// "Pagar con Mercado Pago": which orders can pay and the Checkout Pro order (Orders API) sent to Mercado Pago.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startMercadoPagoCheckout } from "../src/server/payments/checkout.ts";
import { createMercadoPagoClient, MercadoPagoError } from "../src/server/payments/mercadopago.ts";

const now = new Date("2026-11-01T15:00:00Z");
const order = {
  id: "0b3f6f9e-1111-4222-8333-944445555666",
  number: 1042,
  accessToken: "x".repeat(32),
  contactEmail: "ana@example.com",
  status: "pending_payment",
  paymentPreference: "any",
  delivery: { method: "pickup" },
  subtotalMinor: 1_250_050,
  discountMinor: 50_000,
  shippingMinor: 0,
  expiresAt: new Date("2026-11-01T15:12:30Z"),
};
const urls = { returnUrl: "https://tienda.test/pedido/abc?t=tok" };

function deps({ token = "APP_USR-seller", checkout = { id: "ORDTST01", checkoutUrl: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1" }, fail } = {}) {
  const calls = [];
  return {
    calls,
    accessToken: async () => token,
    client: {
      async createCheckoutOrder(accessToken, input) {
        calls.push({ accessToken, input });
        if (fail) throw fail;
        return checkout;
      },
    },
  };
}

describe("start Mercado Pago checkout", () => {
  it("creates a Mercado Pago order for the order total and returns the checkout URL", async () => {
    const d = deps();
    const result = await startMercadoPagoCheckout(d, order, urls, now);
    assert.deepEqual(result, { ok: true, url: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1" });
    assert.equal(d.calls[0].accessToken, "APP_USR-seller");
    assert.deepEqual(d.calls[0].input, {
      orderId: order.id,
      title: "Pedido SUB-1042 — Sublime",
      amountMinor: 1_200_050,
      payerEmail: "ana@example.com",
      returnUrl: urls.returnUrl,
      // 12.5 minutes left: rounded down so Mercado Pago never outlives the reservation.
      expiresInMinutes: 12,
    });
  });

  it("refuses orders that are not payable online", async () => {
    const cases = [
      { ...order, status: "paid" },
      { ...order, status: "expired" },
      { ...order, paymentPreference: "transfer" },
      { ...order, expiresAt: new Date(now.getTime() + 30_000) },
      { ...order, delivery: { method: "shipping" }, shippingMinor: null },
    ];
    for (const candidate of cases) {
      const d = deps();
      assert.deepEqual(await startMercadoPagoCheckout(d, candidate, urls, now), { ok: false, reason: "not_payable" });
      assert.equal(d.calls.length, 0);
    }
  });

  it("explains when no account is connected or Mercado Pago fails", async () => {
    assert.deepEqual(await startMercadoPagoCheckout(deps({ token: null }), order, urls, now), { ok: false, reason: "not_connected" });
    const down = deps({ fail: new MercadoPagoError(503, "unreachable") });
    assert.deepEqual(await startMercadoPagoCheckout(down, order, urls, now), { ok: false, reason: "unavailable" });
  });
});

describe("Checkout Pro order request (Orders API)", () => {
  const config = { clientId: "1", clientSecret: "s", webhookSecret: "w", encryptionKey: Buffer.alloc(32), testMode: false };

  it("sends an online order with string amounts, return URLs, expiry and no cash methods", async () => {
    const calls = [];
    const fetch = async (url, init) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: "ORDTST01", status: "created", checkout_url: "https://mp.test/pay" }), { status: 201 });
    };
    const result = await createMercadoPagoClient(config, fetch).createCheckoutOrder("APP_USR-seller", {
      orderId: order.id,
      title: "Pedido SUB-1042 — Sublime",
      amountMinor: 1_200_050,
      payerEmail: "ana@example.com",
      returnUrl: urls.returnUrl,
      expiresInMinutes: 12,
    });
    assert.deepEqual(result, { id: "ORDTST01", checkoutUrl: "https://mp.test/pay" });
    assert.equal(calls[0].url, "https://api.mercadopago.com/v1/orders");
    assert.equal(calls[0].headers.Authorization, "Bearer APP_USR-seller");
    assert.match(calls[0].headers["X-Idempotency-Key"], /^[0-9a-f-]{36}$/);
    assert.deepEqual(calls[0].body, {
      type: "online",
      processing_mode: "manual",
      external_reference: order.id,
      description: "Pedido SUB-1042 — Sublime",
      total_amount: "12000.50",
      payer: { email: "ana@example.com" },
      items: [{ title: "Pedido SUB-1042 — Sublime", quantity: 1, unit_price: "12000.50", external_code: order.id }],
      expiration_time: "PT12M",
      config: {
        statement_descriptor: "SUBLIME",
        online: { success_url: urls.returnUrl, failure_url: urls.returnUrl, pending_url: urls.returnUrl, auto_return: "approved" },
        payment_method: { not_allowed_types: ["ticket", "atm"] },
      },
    });
  });

  it("reads an order back with paid amount in cents", async () => {
    const fetch = async (url) => {
      assert.equal(url, "https://api.mercadopago.com/v1/orders/ORDTST01");
      return new Response(
        JSON.stringify({
          id: "ORDTST01",
          status: "processed",
          status_detail: "accredited",
          external_reference: order.id,
          total_amount: "12000.50",
          total_paid_amount: "12000.50",
          currency: "ARS",
        }),
        { status: 200 },
      );
    };
    assert.deepEqual(await createMercadoPagoClient(config, fetch).getOrder("APP_USR-seller", "ORDTST01"), {
      id: "ORDTST01",
      status: "processed",
      statusDetail: "accredited",
      externalReference: order.id,
      paidAmountMinor: 1_200_050,
      currency: "ARS",
    });
  });

  it("reads a non-numeric paid amount as zero (never confirmed, no endless retries)", async () => {
    const fetch = async () => new Response(JSON.stringify({ id: "ORDTST02", status: "processed", total_paid_amount: "abc" }), { status: 200 });
    assert.equal((await createMercadoPagoClient(config, fetch).getOrder("APP_USR-seller", "ORDTST02")).paidAmountMinor, 0);
  });
});
