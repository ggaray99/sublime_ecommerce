// Design uploads: PNG / JPG / WebP / PSD in, full-resolution PNG + web preview out.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { writePsdBuffer } from "ag-psd";
import sharp from "sharp";
import { DesignFileError, prepareDesignFile, PREVIEW_MAX_PX } from "../src/server/designs/files.ts";

const transparentPng = (width, height) =>
  sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: { create: { width: Math.round(width / 2), height: Math.round(height / 2), channels: 4, background: "#e5007e" } }, gravity: "center" }])
    .png()
    .toBuffer();

function psd(width, height, { composite = true } = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([20, 120, 220, i % 8 === 0 ? 0 : 255], i);
  const document = { width, height, children: [{ name: "Capa 1", imageData: { width, height, data } }] };
  if (composite) document.imageData = { width, height, data };
  return writePsdBuffer(document, { noBackground: true });
}

describe("design files", () => {
  it("keeps a transparent PNG at full size and makes a smaller preview", async () => {
    const result = await prepareDesignFile(await transparentPng(3000, 2000));
    assert.deepEqual([result.width, result.height, result.opaque, result.format, result.warning], [3000, 2000, false, "png", null]);
    const source = await sharp(result.source).metadata();
    assert.deepEqual([source.format, source.width, source.height, source.hasAlpha], ["png", 3000, 2000, true]);
    const preview = await sharp(result.preview).metadata();
    assert.deepEqual([preview.format, preview.width, preview.height], ["webp", PREVIEW_MAX_PX, 800]);
  });

  it("accepts a JPG but warns that it has no transparency", async () => {
    const jpg = await sharp({ create: { width: 1200, height: 1200, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
    const result = await prepareDesignFile(jpg);
    assert.equal(result.opaque, true);
    assert.equal(result.format, "jpg");
    assert.match(result.warning, /fondo/);
  });

  it("flattens a Photoshop file saved with its composite image", async () => {
    const result = await prepareDesignFile(psd(800, 600));
    assert.deepEqual([result.width, result.height, result.format, result.opaque], [800, 600, "psd", false]);
    assert.equal((await sharp(result.source).metadata()).format, "png");
  });

  it("asks for a compatible PSD when it has no composite image", async () => {
    await assert.rejects(() => prepareDesignFile(psd(800, 600, { composite: false })), (error) => error instanceof DesignFileError && /compatibilidad/i.test(error.message));
  });

  it("rejects SVG, empty and tiny files", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><script>alert(1)</script></svg>');
    await assert.rejects(() => prepareDesignFile(svg), /PNG, JPG, WebP o PSD/);
    await assert.rejects(() => prepareDesignFile(new Uint8Array()), /vacío/);
    const tiny = await transparentPng(200, 200);
    await assert.rejects(() => prepareDesignFile(tiny), /chica/);
  });
});
