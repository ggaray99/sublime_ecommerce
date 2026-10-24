// Custom Lab T-shirts: validation, placement rules and the files built on the server.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import sharp from "sharp";
import { clampPlacement, printArea, printWidthCm } from "../src/lib/lab/tshirt.ts";
import { buildTshirtOrder, parseTshirtOrder } from "../src/server/lab/tshirt-order.ts";
import { storeLabUpload } from "../src/server/lab/uploads.ts";

const order = (patch = {}) =>
  JSON.stringify({
    color: "black",
    side: "front",
    design: { source: "catalog", id: "ruido-visual" },
    placement: { scale: 0.6, x: 0.5, y: 0.4 },
    sizes: [
      { size: "M", quantity: 3 },
      { size: "L", quantity: 2 },
      { size: "XL", quantity: 0 },
    ],
    ...patch,
  });

describe("placement", () => {
  it("keeps the design inside the print area and within the scale range", () => {
    const p = clampPlacement({ scale: 5, x: -1, y: 2 }, 1);
    assert.ok(p.scale <= 1 && p.x >= p.scale / 2 && p.y <= 1);
    assert.equal(clampPlacement({ scale: 0.01, x: 0.5, y: 0.5 }, 1).scale, 0.2);
    assert.equal(printWidthCm({ scale: 0.5, x: 0.5, y: 0.5 }), 14);
    const area = printArea("black", "front");
    assert.ok(area.left > 0 && area.top > 0 && area.left + area.width < 1080 && area.top + area.height < 1080);
  });
});

describe("parseTshirtOrder", () => {
  it("accepts a catalog design and drops empty sizes", () => {
    const parsed = parseTshirtOrder(order());
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.value.sizes, [
      { size: "M", quantity: 3 },
      { size: "L", quantity: 2 },
    ]);
  });

  it("rejects anything outside the allowed lists", () => {
    for (const patch of [
      { color: "rosa" },
      { side: "manga" },
      { design: { source: "catalog", id: "no-existe" } },
      { design: { source: "upload", uploadId: "../x.png" } },
      { sizes: [{ size: "XXXL", quantity: 1 }] },
      { sizes: [{ size: "M", quantity: 0 }] },
      { sizes: [{ size: "M", quantity: 201 }] },
      { placement: { scale: "a" } },
    ]) {
      assert.equal(parseTshirtOrder(order(patch)).ok, false, JSON.stringify(patch));
    }
  });
});

describe("buildTshirtOrder", () => {
  let root;
  const previous = process.env.MEDIA_ROOT;
  before(async () => {
    root = await mkdtemp(join(tmpdir(), "sublime-shirt-"));
    process.env.MEDIA_ROOT = root;
  });
  after(async () => {
    if (previous === undefined) delete process.env.MEDIA_ROOT;
    else process.env.MEDIA_ROOT = previous;
    await rm(root, { recursive: true, force: true });
  });

  it("builds the mockup and a 300 dpi print of the 28 × 35 cm area for a catalog design", async () => {
    const built = await buildTshirtOrder(parseTshirtOrder(order()).value);
    assert.equal(built.total, 5);
    const production = built.files.find((f) => f.role === "production");
    const meta = await sharp(production.bytes).metadata();
    assert.equal(meta.width, 3307);
    assert.equal(meta.height, 4134);
    assert.ok(built.files.some((f) => f.role === "preview"));
    assert.ok(!built.files.some((f) => f.role === "original"), "catalog designs are not copied as originals");
    assert.match(built.summary, /Ruido Visual/);
  });

  it("refuses an uploaded design with too little resolution for its printed size", async () => {
    const small = await sharp({ create: { width: 300, height: 300, channels: 4, background: "#e11d48" } }).png().toBuffer();
    const upload = await storeLabUpload(small);
    const parsed = parseTshirtOrder(order({ design: { source: "upload", uploadId: upload.uploadId, name: "logo" }, placement: { scale: 0.9, x: 0.5, y: 0.5 } }));
    await assert.rejects(buildTshirtOrder(parsed.value), /poca resolución/);
  });
});
