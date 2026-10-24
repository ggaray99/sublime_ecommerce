// Custom requests (encargos): form validation, attachments, quote flow and access.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import sharp from "sharp";
import {
  argentinaToday,
  createCustomRequestRepository,
  CustomRequestError,
  quoteIsOpen,
  requestNumber,
} from "../src/server/custom-requests/repository.ts";
import { parseQuoteResponse, parseRequestForm } from "../src/server/custom-requests/validation.ts";
import { inspectAttachment, privateStorage } from "../src/server/media/private-files.ts";

const dbDir = join(import.meta.dirname, "..", "db");
const sqlFiles = (folder) =>
  readdirSync(join(dbDir, folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dbDir, folder, name), "utf8"));

const form = {
  idempotencyKey: "enc-0001-abcdef",
  name: "Ana Pérez",
  email: "ANA@example.com",
  productType: "Etiquetas para marca",
  quantity: "300",
  idea: "Etiquetas redondas de 5 cm con el logo de mi café, fondo negro.",
  reference: "Instagram @cafe",
  productSlug: "etiquetas-para-tu-marca",
};

const plusDays = (days) => {
  const date = new Date(`${argentinaToday()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

describe("custom request validation", () => {
  it("accepts the public form and normalizes it", () => {
    const result = parseRequestForm(form);
    assert.equal(result.ok, true);
    assert.deepEqual([result.value.contactEmail, result.value.quantity, result.value.productSlug], ["ana@example.com", 300, "etiquetas-para-tu-marca"]);
  });

  it("rejects short ideas, unknown types and bots", () => {
    const bad = parseRequestForm({ ...form, idea: "corto", productType: "Tazas", quantity: "0" });
    assert.deepEqual(Object.keys(bad.errors).sort(), ["idea", "productType", "quantity"]);
    const bot = parseRequestForm({ ...form, website: "http://spam.example" });
    assert.equal(bot.bot, true);
  });

  it("validates the quote an admin sends", () => {
    const ok = parseQuoteResponse({ amount: "45.000", deposit: "15.000", message: "Incluye diseño", validUntil: plusDays(7), etaDays: "10" });
    assert.deepEqual(ok.value, { quoteMinor: 4500000, depositMinor: 1500000, message: "Incluye diseño", validUntil: plusDays(7), etaDays: 10 });
    const bad = parseQuoteResponse({ amount: "100", deposit: "200", validUntil: plusDays(-1), etaDays: "500" });
    assert.deepEqual(Object.keys(bad.errors).sort(), ["deposit", "etaDays", "validUntil"]);
  });
});

describe("custom request attachments", () => {
  it("accepts images and PDFs by their bytes, nothing else", async () => {
    const png = new Uint8Array(await sharp({ create: { width: 50, height: 50, channels: 3, background: "#000" } }).png().toBuffer());
    assert.equal(inspectAttachment(png).type, "image/png", "references have no minimum size");
    assert.equal(inspectAttachment(new TextEncoder().encode("%PDF-1.7\n…")).type, "application/pdf");
    assert.throws(() => inspectAttachment(new TextEncoder().encode("<svg/>")), /Formato no admitido/);
    assert.throws(() => inspectAttachment(new Uint8Array(4 * 1024 * 1024 + 1).fill(37)), /4 MB/);
  });

  it("uses a separate private store, off in production unless enabled", () => {
    assert.equal(privateStorage({}), null);
    assert.deepEqual(privateStorage({ PRIVATE_BLOB_STORE_ID: "store_p", VERCEL_ENV: "preview" }), { storeId: "store_p" });
    assert.equal(privateStorage({ PRIVATE_BLOB_STORE_ID: "store_p", VERCEL_ENV: "production" }), null);
    assert.equal(privateStorage({ BLOB_STORE_ID: "store_public" }), null, "the public photo store is never used for references");
  });
});

describe("custom requests on PostgreSQL (PGlite)", () => {
  let db;
  let repo;
  let request;

  before(async () => {
    db = new PGlite();
    for (const sql of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(sql);
    repo = createCustomRequestRepository({ query: async (text, params) => (await db.query(text, params)).rows });
    request = await repo.create({
      ...parseRequestForm(form).value,
      customerId: null,
      file: { pathname: "encargos/x/archivo-abc.png", originalName: "logo.png", contentType: "image/png", sizeBytes: 1200 },
    });
  });
  after(() => db.close());

  it("saves the request with its file, number and history; repeats return the same one", async () => {
    assert.match(requestNumber(request), /^ENC-50\d\d$/);
    const detail = await repo.get(request.id);
    assert.equal(detail.status, "received");
    assert.equal(detail.files[0].originalName, "logo.png");
    assert.deepEqual(detail.events.map((event) => event.toStatus), ["received"]);
    const again = await repo.create({ ...parseRequestForm(form).value, customerId: null, file: null });
    assert.equal(again.id, request.id);
    assert.equal((await repo.get(request.id)).files.length, 1);
  });

  it("only opens with the right token", async () => {
    assert.equal((await repo.getByToken(request.id, request.accessToken)).id, request.id);
    assert.equal(await repo.getByToken(request.id, "x".repeat(40)), null);
  });

  it("counts recent requests per email for the anti-spam limit", async () => {
    assert.equal(await repo.recentCountByEmail("ana@EXAMPLE.com"), 1);
  });

  it("quote → customer accepts → production → delivered", async () => {
    await assert.rejects(repo.decide(request.id, "accept", "cliente"), (error) => error.code === "invalid_transition", "nothing to accept yet");
    await repo.sendQuote("admin@example.com", request.id, { quoteMinor: 4500000, depositMinor: 1500000, message: "Incluye diseño", validUntil: plusDays(7), etaDays: 10 });
    let detail = await repo.get(request.id);
    assert.equal(quoteIsOpen(detail), true);
    // Re-quoting is allowed before the customer answers.
    await repo.sendQuote("admin@example.com", request.id, { quoteMinor: 4200000, depositMinor: null, message: "Ajuste", validUntil: plusDays(5), etaDays: null });
    await repo.decide(request.id, "accept", "cliente");
    await repo.startProduction("admin@example.com", request.id, "");
    await repo.markDelivered("admin@example.com", request.id, "");
    detail = await repo.get(request.id);
    assert.deepEqual([detail.status, detail.quoteMinor, detail.depositMinor], ["delivered", 4200000, null]);
    assert.deepEqual(detail.events.map((event) => event.toStatus), ["received", "quoted", "quoted", "accepted", "in_production", "delivered"]);
    await assert.rejects(repo.cancel("admin", request.id, "x"), (error) => error instanceof CustomRequestError && error.code === "invalid_transition");
  });

  it("expired quotes cannot be accepted; customers can decline", async () => {
    const other = await repo.create({ ...parseRequestForm({ ...form, idempotencyKey: "enc-0002-abcdef" }).value, customerId: null, file: null });
    await repo.sendQuote("admin", other.id, { quoteMinor: 100000, depositMinor: null, message: "", validUntil: plusDays(1), etaDays: null });
    await db.query("UPDATE custom_requests SET quote_valid_until = current_date - 2 WHERE id = $1", [other.id]);
    await assert.rejects(repo.decide(other.id, "accept", "cliente"), (error) => error.code === "expired_quote");
    await repo.sendQuote("admin", other.id, { quoteMinor: 100000, depositMinor: null, message: "Renovado", validUntil: plusDays(3), etaDays: null });
    await repo.decide(other.id, "decline", "cliente", "Muy caro");
    assert.equal((await repo.get(other.id)).status, "declined");
  });

  it("the database keeps quotes consistent", async () => {
    await assert.rejects(db.query("UPDATE custom_requests SET status = 'quoted', quote_minor = NULL WHERE id = $1", [request.id]));
    await assert.rejects(db.query("UPDATE custom_requests SET deposit_minor = quote_minor + 1 WHERE id = $1", [request.id]));
  });

  it("cancels open requests with a note", async () => {
    const third = await repo.create({ ...parseRequestForm({ ...form, idempotencyKey: "enc-0003-abcdef" }).value, customerId: null, file: null });
    await repo.cancel("admin", third.id, "Duplicado");
    const detail = await repo.get(third.id);
    assert.deepEqual([detail.status, detail.events.at(-1).note], ["cancelled", "Duplicado"]);
  });
});
