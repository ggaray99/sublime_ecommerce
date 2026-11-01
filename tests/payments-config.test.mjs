// Mercado Pago configuration per environment and encryption of the stored tokens.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { mercadoPagoConfig, missingPaymentSettings } from "../src/server/payments/config.ts";
import { decryptSecret, encryptSecret } from "../src/server/payments/crypto.ts";

const key = randomBytes(32).toString("base64");
const full = {
  DATABASE_URL: "postgres://x",
  MERCADOPAGO_CLIENT_ID: "123",
  MERCADOPAGO_CLIENT_SECRET: "client-secret",
  MERCADOPAGO_WEBHOOK_SECRET: "webhook-secret",
  PAYMENTS_ENCRYPTION_KEY: key,
};

describe("payments configuration", () => {
  it("is ready on staging with every variable", () => {
    const config = mercadoPagoConfig({ ...full, SUBLIME_ENV: "staging" });
    assert.equal(config?.clientId, "123");
    assert.equal(config?.testMode, false);
    assert.equal(config?.encryptionKey.length, 32);
  });

  it("requires the production switch in production", () => {
    assert.equal(mercadoPagoConfig({ ...full, SUBLIME_ENV: "production" }), null);
    assert.ok(mercadoPagoConfig({ ...full, SUBLIME_ENV: "production", SUBLIME_PAYMENTS_IN_PRODUCTION: "enabled" }));
  });

  it("reads test mode only when explicitly on", () => {
    assert.equal(mercadoPagoConfig({ ...full, MERCADOPAGO_TEST_MODE: "true" })?.testMode, true);
    assert.equal(mercadoPagoConfig({ ...full, MERCADOPAGO_TEST_MODE: "1" })?.testMode, false);
  });

  it("names what is missing, never the values", () => {
    assert.deepEqual(missingPaymentSettings({ DATABASE_URL: "postgres://x" }), [
      "MERCADOPAGO_CLIENT_ID",
      "MERCADOPAGO_CLIENT_SECRET",
      "MERCADOPAGO_WEBHOOK_SECRET",
      "PAYMENTS_ENCRYPTION_KEY",
    ]);
    assert.equal(mercadoPagoConfig({ DATABASE_URL: "postgres://x" }), null);
    assert.deepEqual(missingPaymentSettings({ ...full, DATABASE_URL: "" }), ["DATABASE_URL"]);
    assert.deepEqual(missingPaymentSettings({ ...full, SUBLIME_ENV: "production" }), ["SUBLIME_PAYMENTS_IN_PRODUCTION"]);
  });

  it("flags a client id that is not the numeric application number (e.g. a public key)", () => {
    const publicKey = { ...full, MERCADOPAGO_CLIENT_ID: "APP_USR-2ce35105-b5fc-412f-88c4-35c7dc25c4a8" };
    assert.deepEqual(missingPaymentSettings(publicKey), ["MERCADOPAGO_CLIENT_ID"]);
    assert.equal(mercadoPagoConfig(publicKey), null);
  });

  it("rejects an encryption key that is not 32 bytes", () => {
    const short = { ...full, PAYMENTS_ENCRYPTION_KEY: randomBytes(16).toString("base64") };
    assert.deepEqual(missingPaymentSettings(short), ["PAYMENTS_ENCRYPTION_KEY"]);
    assert.equal(mercadoPagoConfig(short), null);
  });
});

describe("token encryption", () => {
  const secretKey = randomBytes(32);

  it("round-trips and never stores the plain text", () => {
    const sealed = encryptSecret("APP_USR-token", secretKey);
    assert.ok(!sealed.includes("APP_USR"));
    assert.equal(decryptSecret(sealed, secretKey), "APP_USR-token");
  });

  it("uses a fresh nonce every time", () => {
    assert.notEqual(encryptSecret("same", secretKey), encryptSecret("same", secretKey));
  });

  it("fails on tampering or with another key", () => {
    const sealed = encryptSecret("APP_USR-token", secretKey);
    const [version, iv, tag, data] = sealed.split(".");
    const flipped = Buffer.from(data, "base64url");
    flipped[0] ^= 1;
    assert.throws(() => decryptSecret([version, iv, tag, flipped.toString("base64url")].join("."), secretKey));
    assert.throws(() => decryptSecret(sealed, randomBytes(32)));
    assert.throws(() => decryptSecret("garbage", secretKey));
  });

  it("rejects a truncated authentication tag", () => {
    const [version, iv, tag, data] = encryptSecret("APP_USR-token", secretKey).split(".");
    const short = Buffer.from(tag, "base64url").subarray(0, 4).toString("base64url");
    assert.throws(() => decryptSecret([version, iv, short, data].join("."), secretKey));
  });
});
