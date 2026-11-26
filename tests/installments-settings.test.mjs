// Installments setting (/admin/ajustes › Cuotas): validation, defaults and storage over PostgreSQL (PGlite).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createInstallmentsRepository, DEFAULT_INSTALLMENTS, parseInstallments } from "../src/server/settings/installments.ts";

describe("parseInstallments", () => {
  it("is off by default: 3 installments from $ 0", () => {
    assert.deepEqual(DEFAULT_INSTALLMENTS, { enabled: false, count: 3, minAmount: 0 });
  });

  it("accepts an enabled setting with a count and a minimum in pesos", () => {
    assert.deepEqual(parseInstallments({ enabled: "on", count: "6", minAmount: "20.000" }), { ok: true, value: { enabled: true, count: 6, minAmount: 20_000 } });
    // Unchecked box and empty minimum: off, from $ 0.
    assert.deepEqual(parseInstallments({ count: "3", minAmount: "" }), { ok: true, value: { enabled: false, count: 3, minAmount: 0 } });
  });

  it("only allows 2 to 24 installments", () => {
    for (const count of ["1", "25", "3,5", "tres", ""]) {
      const parsed = parseInstallments({ enabled: "on", count, minAmount: "0" });
      assert.equal(parsed.ok, false, count);
      assert.ok(parsed.errors.count);
    }
    assert.equal(parseInstallments({ enabled: "on", count: "2", minAmount: "0" }).ok, true);
    assert.equal(parseInstallments({ enabled: "on", count: "24", minAmount: "0" }).ok, true);
  });

  it("rejects a minimum that is not a whole amount in pesos", () => {
    for (const minAmount of ["-100", "abc", "1.000,50"]) {
      const parsed = parseInstallments({ enabled: "on", count: "3", minAmount });
      assert.equal(parsed.ok, false, minAmount);
      assert.ok(parsed.errors.minAmount);
    }
  });
});

describe("installments repository (PGlite)", () => {
  let db;
  let repo;

  before(async () => {
    db = new PGlite();
    for (const name of readdirSync(join("db", "migrations")).filter((n) => n.endsWith(".sql")).sort()) {
      await db.exec(readFileSync(join("db", "migrations", name), "utf8"));
    }
    repo = createInstallmentsRepository({ query: async (text, params) => (await db.query(text, params)).rows });
  });

  after(() => db.close());

  it("returns the defaults until saved, then the saved setting, with an audit entry per save", async () => {
    assert.deepEqual(await repo.get(), DEFAULT_INSTALLMENTS);
    const actor = { authUserId: "admin-1", email: "admin@example.com" };
    await repo.save(actor, { enabled: true, count: 6, minAmount: 20_000 });
    await repo.save(actor, { enabled: true, count: 3, minAmount: 0 });
    assert.deepEqual(await repo.get(), { enabled: true, count: 3, minAmount: 0 });
    const { rows } = await db.query("SELECT action, entity, entity_id, actor_email FROM audit_logs WHERE action = 'settings.installments'");
    assert.equal(rows.length, 2);
    assert.deepEqual({ ...rows[0] }, { action: "settings.installments", entity: "settings", entity_id: "installments", actor_email: "admin@example.com" });
  });
});
