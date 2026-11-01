// "Pagar con Mercado Pago": which orders can pay and the preference sent to Mercado Pago.
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
  expiresAt: new Date("2026-11-01T15:12:00Z"),
};
const urls = { returnUrl: "https://tienda.test/pedido/abc?t=tok", notificationUrl: "https://tienda.test/api/mercadopago/webhook?source_news=webhooks" };

function deps({ token = "APP_USR-seller", preference = { id: "pref-1", initPoint: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1" }, fail } = {}) {
  const calls = [];
  return {
    calls,
    accessToken: async () => token,
    client: {
      async createPreference(accessToken, input) {
        calls.push({ accessToken, input });
        if (fail) throw fail;
        return preference;
      },
    },
  };
}

describe("start Mercado Pago checkout", () => {
  it("creates a preference for the order total and returns the checkout URL", async () => {
    const d = deps();
    const result = await startMercadoPagoCheckout(d, order, urls, now);
    assert.deepEqual(result, { ok: true, url: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1" });
    assert.equal(d.calls[0].accessToken, "APP_USR-seller");
    assert.deepEqual(d.calls[0].input, {
      orderId: order.id,
      title: "Pedido SUB-1042 — Sublime",
      amountMinor: 1_200_050,
      payerEmail: "ana@example.com",
      returnUrl: urls.returnUrl,
      notificationUrl: urls.notificationUrl,
      expiresAt: order.expiresAt,
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

describe("preference request", () => {
  it("sends pesos, the order reference, return URLs, expiry and no cash methods", async () => {
    const calls = [];
    const fetch = async (url, init) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ id: "pref-1", init_point: "https://mp.test/pay" }), { status: 201 });
    };
    const client = createMercadoPagoClient({ clientId: "1", clientSecret: "s", webhookSecret: "w", encryptionKey: Buffer.alloc(32), testMode: false }, fetch);
    const result = await client.createPreference("APP_USR-seller", {
      orderId: order.id,
      title: "Pedido SUB-1042 — Sublime",
      amountMinor: 1_200_050,
      payerEmail: "ana@example.com",
      ...urls,
      expiresAt: order.expiresAt,
    });
    assert.deepEqual(result, { id: "pref-1", initPoint: "https://mp.test/pay" });
    assert.equal(calls[0].url, "https://api.mercadopago.com/checkout/preferences");
    assert.equal(calls[0].headers.Authorization, "Bearer APP_USR-seller");
    assert.ok(calls[0].headers["X-Idempotency-Key"]);
    const body = calls[0].body;
    assert.deepEqual(body.items, [{ id: order.id, title: "Pedido SUB-1042 — Sublime", quantity: 1, unit_price: 12000.5, currency_id: "ARS" }]);
    assert.equal(body.external_reference, order.id);
    assert.equal(body.notification_url, urls.notificationUrl);
    assert.deepEqual(body.back_urls, { success: urls.returnUrl, pending: urls.returnUrl, failure: urls.returnUrl });
    assert.equal(body.auto_return, "approved");
    assert.equal(body.expires, true);
    assert.equal(body.expiration_date_to, "2026-11-01T15:12:00.000Z");
    assert.deepEqual(body.payment_methods.excluded_payment_types, [{ id: "ticket" }, { id: "atm" }]);
  });
});
