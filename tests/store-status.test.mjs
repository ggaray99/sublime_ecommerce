// Store open/closed switch and the admin preview cookie.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createPreviewToken, verifyPreviewToken } from "../src/server/preview.ts";
import { createStoreStatusRepository, forgetStoreStatus, isStoreClosed } from "../src/server/store-status.ts";

describe("preview token", () => {
  const secret = "a-secret-of-at-least-32-characters!!";
  it("accepts its own token until it expires", () => {
    const now = Date.UTC(2026, 9, 26);
    const token = createPreviewToken(secret, now);
    assert.equal(verifyPreviewToken(token, secret, now + 1000), true);
    assert.equal(verifyPreviewToken(token, secret, now + 8 * 86_400_000), false, "expired after 7 days");
  });

  it("rejects forged, edited or foreign tokens", () => {
    const token = createPreviewToken(secret);
    const [expires, mac] = token.split(".");
    assert.equal(verifyPreviewToken(`${Number(expires) + 86_400_000}.${mac}`, secret), false, "longer expiry");
    assert.equal(verifyPreviewToken(token, "another-secret-of-32-characters!!!!"), false);
    assert.equal(verifyPreviewToken("1", secret), false);
    assert.equal(verifyPreviewToken(undefined, secret), false);
    assert.equal(verifyPreviewToken(token, undefined), false);
  });
});

describe("store status (PGlite)", () => {
  let db;
  let repo;
  before(async () => {
    db = new PGlite();
    const files = readdirSync(join("db", "migrations")).filter((n) => n.endsWith(".sql")).sort();
    for (const name of files) await db.exec(readFileSync(join("db", "migrations", name), "utf8"));
    repo = createStoreStatusRepository({ query: async (text, params) => (await db.query(text, params)).rows });
  });
  after(() => db.close());

  it("follows SUBLIME_MAINTENANCE until the panel sets it, then the panel wins", async () => {
    const previous = process.env.SUBLIME_MAINTENANCE;
    process.env.SUBLIME_MAINTENANCE = "1";
    try {
      assert.equal((await repo.get()).closed, true);
      await repo.save({ authUserId: "a", email: "a@example.com" }, false);
      const status = await repo.get();
      assert.equal(status.closed, false);
      assert.equal(status.updatedBy, "a@example.com");
      const { rows } = await db.query("SELECT action FROM audit_logs WHERE action = 'settings.store_status'");
      assert.equal(rows.length, 1);
    } finally {
      process.env.SUBLIME_MAINTENANCE = previous;
    }
  });

  it("the proxy reads it at most every few seconds and survives a database error", async () => {
    forgetStoreStatus();
    let reads = 0;
    const load = async () => (reads++, { closed: true, updatedBy: null, updatedAt: null });
    assert.equal(await isStoreClosed(load), true);
    assert.equal(await isStoreClosed(load), true);
    assert.equal(reads, 1, "cached");
    forgetStoreStatus();
    assert.equal(await isStoreClosed(async () => { throw new Error("down"); }), process.env.SUBLIME_MAINTENANCE === "1");
  });
});
