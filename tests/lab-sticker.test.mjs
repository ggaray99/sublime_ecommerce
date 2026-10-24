// Custom Lab server processing: background removal, 32 px white contour, DPI checks and the sheet render.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { CONTOUR_PX, packSheets, stickerFootprintMm } from "../src/lib/lab/sheets.ts";
import { floodRemoveBackground, prepareSticker, renderSheetPng, StickerError } from "../src/server/lab/sticker.ts";

const svg = (body, size = 1000, bg = "none") =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="${bg}"/>${body}</svg>`);

const alphaAt = async (png, x, y) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * 4 + 3];
};

describe("floodRemoveBackground", () => {
  it("clears the plain background connected to the borders and keeps the artwork", () => {
    const w = 10;
    const h = 10;
    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set([250, 250, 250, 255], i * 4); // near-white background
    for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) data.set([20, 40, 200, 255], (y * w + x) * 4); // blue square
    const removed = floodRemoveBackground(data, w, h);
    assert.equal(removed, 100 - 16);
    assert.equal(data[(5 * w + 5) * 4 + 3], 255);
    assert.equal(data[3], 0);
  });
});

describe("prepareSticker", () => {
  it("keeps a transparent PNG, sizes it to print and adds a 32 px contour", async () => {
    const png = await sharp(svg('<circle cx="500" cy="500" r="400" fill="#e11d48"/>')).png().toBuffer();
    const sticker = await prepareSticker(png, { sizeCm: 5, removeBackground: true });
    assert.equal(sticker.hadTransparency, true);
    assert.equal(sticker.backgroundRemoved, false);
    // 5 cm at 300 dpi = 591 px for the design (the 800 px circle), plus 32 px of contour on each side (±2 px).
    assert.ok(Math.abs(sticker.widthPx - (591 + 2 * CONTOUR_PX)) <= 2, `width ${sticker.widthPx}`);
    assert.ok(sticker.dpi > 400);
    const mid = Math.round(sticker.heightPx / 2);
    assert.equal(await alphaAt(sticker.withContour, 2, mid), 255, "the contour is solid up to its outer edge");
    const { data } = await sharp(sticker.withContour).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([...data.subarray((mid * sticker.widthPx + 8) * 4, (mid * sticker.widthPx + 8) * 4 + 3)], [255, 255, 255], "the contour is white");
  });

  it("removes a plain background from a JPG when asked", async () => {
    const jpg = await sharp(svg('<rect x="300" y="200" width="400" height="600" fill="#1d4ed8"/>', 1000, "#ffffff")).jpeg().toBuffer();
    const sticker = await prepareSticker(jpg, { sizeCm: 6, removeBackground: true });
    assert.equal(sticker.hadTransparency, false);
    assert.equal(sticker.backgroundRemoved, true);
    // Trimmed to the 400 × 600 rectangle: taller than wide.
    assert.ok(sticker.heightPx > sticker.widthPx);
    const kept = await prepareSticker(jpg, { sizeCm: 6, removeBackground: false });
    assert.equal(kept.backgroundRemoved, false);
    assert.ok(Math.abs(kept.widthPx - kept.heightPx) <= 1, "without removal the whole square is the design");
  });

  it("refuses low resolution, unreadable files and fully removed images", async () => {
    const tiny = await sharp(svg('<circle cx="50" cy="50" r="45" fill="#000"/>', 100)).png().toBuffer();
    await assert.rejects(prepareSticker(tiny, { sizeCm: 5, removeBackground: false }), (e) => e instanceof StickerError && /resolución/.test(e.message));
    await assert.rejects(prepareSticker(new TextEncoder().encode("no soy una imagen"), { sizeCm: 5, removeBackground: false }), StickerError);
    const blank = await sharp(svg("", 1000, "#ffffff")).jpeg().toBuffer();
    await assert.rejects(prepareSticker(blank, { sizeCm: 5, removeBackground: true }), StickerError);
  });
});

describe("renderSheetPng", () => {
  it("renders a 21 × 29 cm sheet at 300 dpi with the stickers where the layout puts them", async () => {
    const png = await sharp(svg('<circle cx="500" cy="500" r="480" fill="#16a34a"/>')).png().toBuffer();
    const sticker = await prepareSticker(png, { sizeCm: 4, removeBackground: false });
    const footprint = stickerFootprintMm(1000, 1000, 4);
    const layout = packSheets([{ id: "s", ...footprint, quantity: 3 }]);
    const sheet = await renderSheetPng(layout.sheets[0], new Map([["s", sticker]]));
    const meta = await sharp(sheet).metadata();
    assert.equal(meta.width, 2480);
    assert.equal(meta.height, 3425);
    // Centre of the first sticker is green.
    const first = layout.sheets[0][0];
    const cx = Math.round(((first.xMm + first.widthMm / 2) / 25.4) * 300);
    const cy = Math.round(((first.yMm + first.heightMm / 2) / 25.4) * 300);
    const { data, info } = await sharp(sheet).raw().toBuffer({ resolveWithObject: true });
    const p = (cy * info.width + cx) * info.channels;
    assert.ok(data[p + 1] > 100 && data[p] < 80, "green artwork at the sticker centre");
  });
});
