// Custom Lab sticker sheets: 21 × 29 cm, reserved 1.5 cm corners, 3 mm gaps and margins.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONTOUR_MM, packSheets, perSheet, SHEET, stickerFootprintMm } from "../src/lib/lab/sheets.ts";

const EPS = 1e-6;

/** Every placement inside the margins, outside the corners, and never overlapping (with the gap). */
function assertValid(layout) {
  const { widthMm: W, heightMm: H, cornerMm: c, edgeMarginMm: m, gapMm: g } = SHEET;
  const corners = [
    { x: 0, y: 0 },
    { x: W - c, y: 0 },
    { x: 0, y: H - c },
    { x: W - c, y: H - c },
  ].map((p) => ({ ...p, w: c, h: c }));
  const overlap = (a, b, gap) => a.x < b.x + b.w + gap - EPS && b.x < a.x + a.w + gap - EPS && a.y < b.y + b.h + gap - EPS && b.y < a.y + a.h + gap - EPS;
  for (const sheet of layout.sheets) {
    const rects = sheet.map((p) => ({ x: p.xMm, y: p.yMm, w: p.widthMm, h: p.heightMm }));
    for (const r of rects) {
      assert.ok(r.x >= m - EPS && r.y >= m - EPS && r.x + r.w <= W - m + EPS && r.y + r.h <= H - m + EPS, "inside the margins");
      for (const corner of corners) assert.ok(!overlap(r, corner, g), "keeps out of the reserved corners");
    }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) assert.ok(!overlap(rects[i], rects[j], g), "no overlap");
  }
}

describe("sticker footprint", () => {
  it("scales the longer side to the chosen size and adds the 32 px contour (≈2.71 mm)", () => {
    assert.ok(Math.abs(CONTOUR_MM - 2.709) < 0.001);
    const square = stickerFootprintMm(1000, 1000, 5);
    assert.ok(Math.abs(square.widthMm - (50 + 2 * CONTOUR_MM)) < EPS);
    const tall = stickerFootprintMm(500, 1000, 6);
    assert.ok(Math.abs(tall.heightMm - (60 + 2 * CONTOUR_MM)) < EPS);
    assert.ok(Math.abs(tall.widthMm - (30 + 2 * CONTOUR_MM)) < EPS);
  });
});

describe("packSheets", () => {
  it("fills a sheet without touching corners, margins or other pieces", () => {
    const { widthMm, heightMm } = stickerFootprintMm(1000, 1000, 4);
    const layout = packSheets([{ id: "a", widthMm, heightMm, quantity: 60 }]);
    assertValid(layout);
    assert.equal(layout.unplaced.length, 0);
  });

  it("uses more sheets as the quantity grows, and the count matches the capacity", () => {
    for (const size of [4, 5, 6]) {
      const { widthMm, heightMm } = stickerFootprintMm(1000, 1000, size);
      const capacity = perSheet(widthMm, heightMm);
      assert.ok(capacity > 0, `${size} cm fits`);
      const exact = packSheets([{ id: "a", widthMm, heightMm, quantity: capacity }]);
      assert.equal(exact.sheets.length, 1, `${size} cm: ${capacity} fit in one sheet`);
      const oneMore = packSheets([{ id: "a", widthMm, heightMm, quantity: capacity + 1 }]);
      assert.equal(oneMore.sheets.length, 2);
      assertValid(oneMore);
    }
    // Smaller stickers, more per sheet.
    const s4 = stickerFootprintMm(1000, 1000, 4);
    const s6 = stickerFootprintMm(1000, 1000, 6);
    assert.ok(perSheet(s4.widthMm, s4.heightMm) > perSheet(s6.widthMm, s6.heightMm));
  });

  it("mixes designs of different shapes and rotates when it helps", () => {
    const tall = stickerFootprintMm(400, 1000, 6);
    const wide = stickerFootprintMm(1000, 500, 5);
    const round = stickerFootprintMm(900, 900, 4);
    const layout = packSheets([
      { id: "tall", ...tall, quantity: 12 },
      { id: "wide", ...wide, quantity: 15 },
      { id: "round", ...round, quantity: 20 },
    ]);
    assertValid(layout);
    const placed = layout.sheets.flat();
    assert.equal(placed.length, 47);
    assert.deepEqual(
      Object.fromEntries(["tall", "wide", "round"].map((id) => [id, placed.filter((p) => p.id === id).length])),
      { tall: 12, wide: 15, round: 20 },
    );
  });

  it("is deterministic", () => {
    const req = [
      { id: "b", ...stickerFootprintMm(800, 1000, 5), quantity: 25 },
      { id: "a", ...stickerFootprintMm(1000, 700, 5), quantity: 25 },
    ];
    assert.deepEqual(packSheets(req), packSheets(req));
  });

  it("reports pieces that cannot fit even on an empty sheet", () => {
    const layout = packSheets([{ id: "huge", widthMm: 300, heightMm: 50, quantity: 1 }]);
    assert.deepEqual(layout.sheets, []);
    assert.deepEqual(layout.unplaced, ["huge"]);
  });
});
