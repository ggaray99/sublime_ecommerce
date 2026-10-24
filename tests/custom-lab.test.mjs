// Custom Lab, phase L1: Lab requests with config and file roles, the notification outbox,
// and the WhatsApp contact setting. Over PostgreSQL (PGlite) with the full schema.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createCustomRequestRepository } from "../src/server/custom-requests/repository.ts";
import { createContactRepository, parseContact, whatsappLink } from "../src/server/settings/contact.ts";

const migrations = () =>
  readdirSync(join("db", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join("db", "migrations", name), "utf8"));

const base = {
  idempotencyKey: "lab-0001-abcdef",
  customerId: null,
  contactName: "Ana Pérez",
  contactEmail: "ana@example.com",
  productType: "Stickers",
  quantity: 40,
  idea: "Stickers del logo de mi cafetería, troquelados con borde blanco.",
  reference: "",
  productSlug: null,
  file: null,
};

describe("Custom Lab requests (PGlite)", () => {
  let db;
  let repo;

  before(async () => {
    db = new PGlite();
    for (const sql of migrations()) await db.exec(sql);
    repo = createCustomRequestRepository({ query: async (text, params) => (await db.query(text, params)).rows });
  });

  after(() => db.close());

  it("stores kind, config and every file with its role, plus one outbox notice, in one statement", async () => {
    const request = await repo.create({
      ...base,
      kind: "sticker",
      config: { v: 1, sizeCm: 5, quantity: 40, sheets: 2 },
      files: [
        { pathname: "lab/a/original-1.png", originalName: "logo.png", contentType: "image/png", sizeBytes: 9000, role: "original", width: 2000, height: 1800 },
        { pathname: "lab/a/vista-1.png", originalName: "vista-previa.png", contentType: "image/png", sizeBytes: 3000, role: "preview", width: 800, height: 720 },
        { pathname: "lab/a/plancha-1.psd", originalName: "plancha-1.psd", contentType: "image/vnd.adobe.photoshop", sizeBytes: 50000, role: "production" },
      ],
    });
    const { rows: [row] } = await db.query("SELECT kind, config FROM custom_requests WHERE id = $1", [request.id]);
    assert.equal(row.kind, "sticker");
    assert.deepEqual(row.config, { v: 1, sizeCm: 5, quantity: 40, sheets: 2 });
    const { rows: files } = await db.query("SELECT role, width FROM custom_request_files WHERE request_id = $1 ORDER BY role", [request.id]);
    assert.deepEqual(files.map((f) => f.role), ["original", "preview", "production"]);
    assert.equal(files[0].width, 2000);
    const { rows: notices } = await db.query("SELECT kind, payload, status FROM notification_outbox");
    assert.equal(notices.length, 1);
    assert.equal(notices[0].kind, "request.created");
    assert.equal(notices[0].payload.requestId, request.id);
    assert.equal(notices[0].status, "pending");
  });

  it("a repeated submit neither duplicates the request nor the notice", async () => {
    await repo.create({ ...base, kind: "sticker", config: { v: 1 } });
    const { rows } = await db.query("SELECT count(*)::int AS n FROM notification_outbox");
    assert.equal(rows[0].n, 1);
  });

  it("the classic form keeps working: kind 'free' and its single file as a reference", async () => {
    const request = await repo.create({
      ...base,
      idempotencyKey: "lab-0002-abcdef",
      file: { pathname: "encargos/b/archivo.png", originalName: "ref.png", contentType: "image/png", sizeBytes: 100 },
    });
    const { rows: [row] } = await db.query("SELECT kind FROM custom_requests WHERE id = $1", [request.id]);
    assert.equal(row.kind, "free");
    const { rows: files } = await db.query("SELECT role FROM custom_request_files WHERE request_id = $1", [request.id]);
    assert.deepEqual(files.map((f) => f.role), ["reference"]);
  });

  it("the database rejects unknown kinds, roles and file types", async () => {
    await assert.rejects(repo.create({ ...base, idempotencyKey: "lab-0003-abcdef", kind: "taza" }));
    await assert.rejects(
      repo.create({ ...base, idempotencyKey: "lab-0004-abcdef", files: [{ pathname: "x", originalName: "x.svg", contentType: "image/svg+xml", sizeBytes: 1, role: "original" }] }),
    );
    await assert.rejects(
      repo.create({ ...base, idempotencyKey: "lab-0005-abcdef", files: [{ pathname: "x", originalName: "x.png", contentType: "image/png", sizeBytes: 1, role: "otro" }] }),
    );
  });
});

describe("contact settings (WhatsApp)", () => {
  it("keeps the digits wa.me expects and requires the country code", () => {
    assert.deepEqual(parseContact({ whatsapp: "+54 9 261 555-1234" }), { ok: true, value: { whatsapp: "5492615551234" } });
    assert.deepEqual(parseContact({ whatsapp: "" }), { ok: true, value: { whatsapp: "" } });
    assert.equal(parseContact({ whatsapp: "261 555 1234" }).ok, false);
    assert.equal(parseContact({ whatsapp: "+54 9 abc" }).ok, false);
  });

  it("builds the link with the request number, or none without a number", () => {
    assert.equal(whatsappLink({ whatsapp: "5492615551234" }, "Hola, encargo ENC-5001"), "https://wa.me/5492615551234?text=Hola%2C%20encargo%20ENC-5001");
    assert.equal(whatsappLink({ whatsapp: "" }, "x"), null);
  });

  it("saves with an audit entry", async () => {
    const db = new PGlite();
    for (const sql of migrations()) await db.exec(sql);
    const repo = createContactRepository({ query: async (text, params) => (await db.query(text, params)).rows });
    assert.deepEqual(await repo.get(), { whatsapp: "" });
    await repo.save({ authUserId: "admin-1", email: "admin@example.com" }, { whatsapp: "5492615551234" });
    assert.equal((await repo.get()).whatsapp, "5492615551234");
    const { rows } = await db.query("SELECT action FROM audit_logs WHERE entity = 'settings'");
    assert.deepEqual(rows.map((r) => r.action), ["settings.contact"]);
    await db.close();
  });
});
