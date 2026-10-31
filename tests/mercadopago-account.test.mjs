// Mercado Pago account linking: OAuth client, encrypted storage and token refresh (PGlite).
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createPaymentAccountRepository, sellerAccessToken } from "../src/server/payments/accounts.ts";
import { authorizationUrl, createMercadoPagoClient, MercadoPagoError, pkcePair } from "../src/server/payments/mercadopago.ts";

const migrations = join(import.meta.dirname, "..", "db", "migrations");
const config = {
  clientId: "1234567890",
  clientSecret: "client-secret",
  webhookSecret: "webhook-secret",
  encryptionKey: randomBytes(32),
  testMode: true,
};
const owner = { authUserId: "auth-owner", email: "duenio@example.com" };

/** fetch double: records requests and answers from a queue. */
function fakeFetch(...responses) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined });
    const next = responses.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "Content-Type": "application/json" } });
  };
  return Object.assign(fn, { calls });
}

const tokenResponse = (overrides = {}) => ({
  status: 200,
  body: {
    access_token: "APP_USR-access-1",
    refresh_token: "TG-refresh-1",
    public_key: "APP_USR-public",
    user_id: 998877,
    expires_in: 15552000,
    live_mode: false,
    ...overrides,
  },
});

describe("OAuth client", () => {
  it("builds the authorization URL with state and PKCE S256", () => {
    const { verifier, challenge } = pkcePair();
    assert.ok(verifier.length >= 43 && verifier.length <= 128);
    assert.equal(challenge, createHash("sha256").update(verifier).digest("base64url"));
    const url = new URL(authorizationUrl({ clientId: "123", redirectUri: "https://tienda.test/api/mercadopago/callback", state: "st4te", codeChallenge: challenge }));
    assert.equal(url.origin + url.pathname, "https://auth.mercadopago.com/authorization");
    assert.equal(url.searchParams.get("client_id"), "123");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("platform_id"), "mp");
    assert.equal(url.searchParams.get("state"), "st4te");
    assert.equal(url.searchParams.get("redirect_uri"), "https://tienda.test/api/mercadopago/callback");
    assert.equal(url.searchParams.get("code_challenge"), challenge);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  });

  it("exchanges the code with the verifier and test_token", async () => {
    const fetch = fakeFetch(tokenResponse());
    const tokens = await createMercadoPagoClient(config, fetch).exchangeCode("TG-code", "https://tienda.test/cb", "verifier-123");
    assert.equal(fetch.calls[0].url, "https://api.mercadopago.com/oauth/token");
    assert.equal(fetch.calls[0].method, "POST");
    assert.deepEqual(fetch.calls[0].body, {
      client_id: "1234567890",
      client_secret: "client-secret",
      grant_type: "authorization_code",
      code: "TG-code",
      redirect_uri: "https://tienda.test/cb",
      code_verifier: "verifier-123",
      test_token: "true",
    });
    assert.equal(tokens.accessToken, "APP_USR-access-1");
    assert.equal(tokens.userId, "998877");
    assert.ok(tokens.expiresAt.getTime() > Date.now() + 170 * 86400_000);
  });

  it("refreshes with the refresh token", async () => {
    const fetch = fakeFetch(tokenResponse({ access_token: "APP_USR-access-2", refresh_token: "TG-refresh-2" }));
    const tokens = await createMercadoPagoClient(config, fetch).refresh("TG-refresh-1");
    assert.deepEqual(fetch.calls[0].body, { client_id: "1234567890", client_secret: "client-secret", grant_type: "refresh_token", refresh_token: "TG-refresh-1" });
    assert.equal(tokens.refreshToken, "TG-refresh-2");
  });

  it("raises a typed error without leaking the secret", async () => {
    const fetch = fakeFetch({ status: 400, body: { error: "invalid_grant", message: "invalid code" } });
    await assert.rejects(createMercadoPagoClient(config, fetch).exchangeCode("bad", "https://x/cb", "v"), (error) => {
      assert.ok(error instanceof MercadoPagoError);
      assert.equal(error.status, 400);
      assert.ok(!error.message.includes("client-secret"));
      return true;
    });
  });
});

describe("connected account storage", () => {
  let db;
  let repo;
  before(async () => {
    db = new PGlite();
    for (const name of readdirSync(migrations).filter((file) => file.endsWith(".sql")).sort()) await db.exec(readFileSync(join(migrations, name), "utf8"));
    const sql = { query: async (text, params) => (await db.query(text, params)).rows };
    repo = createPaymentAccountRepository(sql, config.encryptionKey);
  });
  after(() => db.close());
  beforeEach(() => db.exec("DELETE FROM payment_accounts; DELETE FROM audit_logs;"));

  const linked = {
    accessToken: "APP_USR-access-1",
    refreshToken: "TG-refresh-1",
    publicKey: "APP_USR-public",
    userId: "998877",
    liveMode: false,
    expiresAt: new Date(Date.now() + 180 * 86400_000),
  };

  it("stores tokens encrypted and exposes only public data", async () => {
    await repo.connect(owner, linked, { nickname: "SUBLIME_TEST", email: "ventas@example.com" });
    const account = await repo.get();
    assert.equal(account.userId, "998877");
    assert.equal(account.nickname, "SUBLIME_TEST");
    assert.equal(account.connectedBy, "duenio@example.com");
    assert.equal("accessToken" in account, false);
    const [row] = (await db.query("SELECT access_token_enc, refresh_token_enc FROM payment_accounts")).rows;
    assert.ok(!row.access_token_enc.includes("APP_USR") && !row.refresh_token_enc.includes("TG-"));
    assert.equal((await repo.credentials()).accessToken, "APP_USR-access-1");
  });

  it("audits connect and disconnect without tokens", async () => {
    await repo.connect(owner, linked, { nickname: "SUBLIME_TEST", email: "" });
    await repo.disconnect(owner);
    assert.equal(await repo.get(), null);
    assert.equal(await repo.credentials(), null);
    const logs = (await db.query("SELECT action, entity, entity_id, changes::text AS changes FROM audit_logs ORDER BY created_at, action")).rows;
    assert.deepEqual(logs.map((log) => [log.action, log.entity, log.entity_id]), [
      ["integration.mercadopago_connect", "integration", "mercadopago"],
      ["integration.mercadopago_disconnect", "integration", "mercadopago"],
    ]);
    assert.ok(logs.every((log) => !log.changes.includes("APP_USR") && !log.changes.includes("TG-")));
  });

  it("replaces the account when connecting again", async () => {
    await repo.connect(owner, linked, { nickname: "A", email: "" });
    await repo.connect(owner, { ...linked, userId: "111" }, { nickname: "B", email: "" });
    assert.equal((await repo.get()).userId, "111");
    assert.equal(Number((await db.query("SELECT count(*) AS n FROM payment_accounts")).rows[0].n), 1);
  });

  it("refreshes a token close to expiry and saves the rotated pair", async () => {
    await repo.connect(owner, { ...linked, expiresAt: new Date(Date.now() + 2 * 86400_000) }, { nickname: "A", email: "" });
    const fetch = fakeFetch(tokenResponse({ access_token: "APP_USR-access-2", refresh_token: "TG-refresh-2" }));
    assert.equal(await sellerAccessToken(repo, createMercadoPagoClient(config, fetch)), "APP_USR-access-2");
    assert.equal(fetch.calls[0].body.refresh_token, "TG-refresh-1");
    assert.equal((await repo.credentials()).refreshToken, "TG-refresh-2");
  });

  it("uses a fresh token without calling Mercado Pago", async () => {
    await repo.connect(owner, linked, { nickname: "A", email: "" });
    const fetch = fakeFetch();
    assert.equal(await sellerAccessToken(repo, createMercadoPagoClient(config, fetch)), "APP_USR-access-1");
    assert.equal(fetch.calls.length, 0);
  });

  it("returns null when no account is connected", async () => {
    assert.equal(await sellerAccessToken(repo, createMercadoPagoClient(config, fakeFetch())), null);
  });
});
