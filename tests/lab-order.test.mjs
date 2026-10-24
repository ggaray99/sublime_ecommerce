// Custom Lab sticker orders: parsing what the editor sends and building the files on the server.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import sharp from "sharp";
import { buildStickerOrder, parseStickerDesigns } from "../src/server/lab/sticker-order.ts";
import { isUploadId, readLabUpload, storeLabUpload } from "../src/server/lab/uploads.ts";

const circle = (color) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><circle cx="600" cy="600" r="560" fill="${color}"/></svg>`))
    .png()
    .toBuffer();

describe("parseStickerDesigns", () => {
  const ok = { uploadId: "lab-tmp/original-0123456789abcdef01234567.png", name: "logo", sizeCm: 5, quantity: 10, removeBackground: true, tolerance: 32 };

  it("accepts valid designs and cleans the name", () => {
    const parsed = parseStickerDesigns(JSON.stringify([{ ...ok, name: "mi <logo>.png" }]));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value[0].name, "mi logo.png");
  });

  it("rejects what the client must not decide", () => {
    for (const bad of [
      [],
      [{ ...ok, uploadId: "../../etc/passwd" }],
      [{ ...ok, uploadId: "public/productos/x.png" }],
      [{ ...ok, sizeCm: 7 }],
      [{ ...ok, sizeCm: 4.3 }],
      [{ ...ok, quantity: 0 }],
      [{ ...ok, quantity: 501 }],
      [{ ...ok, tolerance: 200 }],
      Array.from({ length: 9 }, () => ok),
    ]) {
      assert.equal(parseStickerDesigns(JSON.stringify(bad)).ok, false, JSON.stringify(bad).slice(0, 60));
    }
    assert.equal(parseStickerDesigns("no es json").ok, false);
  });
});

describe("sticker order (uploads + build)", () => {
  let root;
  const previous = process.env.MEDIA_ROOT;

  before(async () => {
    root = await mkdtemp(join(tmpdir(), "sublime-lab-"));
    process.env.MEDIA_ROOT = root;
  });

  after(async () => {
    if (previous === undefined) delete process.env.MEDIA_ROOT;
    else process.env.MEDIA_ROOT = previous;
    await rm(root, { recursive: true, force: true });
  });

  it("stores uploads privately with a strict id, and rejects non-images", async () => {
    const upload = await storeLabUpload(await circle("#e11d48"));
    assert.ok(isUploadId(upload.uploadId));
    assert.equal(upload.widthPx, 1200);
    assert.ok((await readLabUpload(upload.uploadId)).length > 0);
    assert.equal(await readLabUpload("lab-tmp/../secreto.png"), null);
    await assert.rejects(storeLabUpload(new TextEncoder().encode("hola")), /No pudimos leer/);
  });

  it("builds originals, previews, sheet previews and one plotter PSD per sheet", async () => {
    const a = await storeLabUpload(await circle("#16a34a"));
    const b = await storeLabUpload(await circle("#2563eb"));
    const order = await buildStickerOrder([
      { uploadId: a.uploadId, name: "verde", sizeCm: 6, quantity: 12, removeBackground: false, tolerance: 32 },
      { uploadId: b.uploadId, name: "azul", sizeCm: 4, quantity: 5, removeBackground: false, tolerance: 32 },
    ]);
    assert.equal(order.total, 17);
    assert.ok(order.sheets >= 1);
    const roles = order.files.map((f) => f.role);
    assert.equal(roles.filter((r) => r === "original").length, 2);
    assert.equal(roles.filter((r) => r === "production").length, order.sheets);
    assert.equal(order.files.filter((f) => f.name.startsWith("plancha-") && f.extension === "png").length, order.sheets);
    assert.equal(order.config.designs.length, 2);
    assert.deepEqual(order.config.perSheet.reduce((s, n) => s + n, 0), 17);
    assert.match(order.summary, /17 unidades/);
  });

  it("refuses an order that needs too many sheets", async () => {
    const a = await storeLabUpload(await circle("#000000"));
    const designs = Array.from({ length: 8 }, (_, i) => ({ uploadId: a.uploadId, name: `d${i}`, sizeCm: 6, quantity: 500, removeBackground: false, tolerance: 32 }));
    await assert.rejects(buildStickerOrder(designs), /escribinos/);
  });
});
