// Notification outbox: delivery, retries with backoff and the no-channel case (PGlite).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createOutboxRepository, MAX_ATTEMPTS, processOutbox, webhookDeliver } from "../src/server/notifications/outbox.ts";

describe("notification outbox (PGlite)", () => {
  let db;
  let repo;
  before(async () => {
    db = new PGlite();
    for (const name of readdirSync(join("db", "migrations")).filter((n) => n.endsWith(".sql")).sort()) {
      await db.exec(readFileSync(join("db", "migrations", name), "utf8"));
    }
    repo = createOutboxRepository({ query: async (text, params) => (await db.query(text, params)).rows });
  });
  after(() => db.close());
  beforeEach(async () => {
    await db.exec("DELETE FROM notification_outbox");
    await db.exec("INSERT INTO notification_outbox (kind, payload) VALUES ('request.created', '{\"number\": 5001}'), ('request.created', '{\"number\": 5002}')");
  });

  it("without a channel, nothing is touched", async () => {
    const result = await processOutbox(repo, null);
    assert.equal(result.skipped, "sin canal configurado");
    assert.deepEqual(await repo.counts(), { pending: 2 });
  });

  it("delivers due rows once and marks them sent", async () => {
    const seen = [];
    const result = await processOutbox(repo, async (row) => seen.push(row.payload.number));
    assert.deepEqual(seen, [5001, 5002]);
    assert.equal(result.sent, 2);
    assert.deepEqual(await repo.counts(), { sent: 2 });
    assert.equal((await processOutbox(repo, async () => seen.push("again"))).sent, 0, "nothing left to send");
  });

  it("retries failures later and gives up after the maximum attempts", async () => {
    await processOutbox(repo, async () => {
      throw new Error("webhook caído");
    });
    const { rows } = await db.query("SELECT status, attempts, last_error, next_attempt_at > now() AS later FROM notification_outbox ORDER BY id");
    assert.deepEqual(rows.map((r) => [r.status, r.attempts, r.last_error, r.later]), [
      ["pending", 1, "webhook caído", true],
      ["pending", 1, "webhook caído", true],
    ]);
    await db.exec(`UPDATE notification_outbox SET attempts = ${MAX_ATTEMPTS - 1}, next_attempt_at = now()`);
    await processOutbox(repo, async () => {
      throw new Error("sigue caído");
    });
    assert.deepEqual(await repo.counts(), { failed: 2 });
  });

  it("the webhook channel posts JSON and fails on non-2xx", async () => {
    const calls = [];
    const ok = webhookDeliver("https://n8n.example/webhook", async (url, init) => {
      calls.push([url, JSON.parse(init.body).kind]);
      return new Response("ok");
    });
    await ok({ id: 1, kind: "request.created", payload: {}, attempts: 0 });
    assert.deepEqual(calls, [["https://n8n.example/webhook", "request.created"]]);
    const bad = webhookDeliver("https://n8n.example/webhook", async () => new Response("no", { status: 500 }));
    await assert.rejects(bad({ id: 1, kind: "x.y", payload: {}, attempts: 0 }), /HTTP 500/);
  });
});
