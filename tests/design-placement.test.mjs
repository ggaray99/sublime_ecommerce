import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampGarmentPlacement,
  cmPerPx,
  DESIGN_CM,
  defaultPlacement,
  designBox,
  mockupTemplate,
  MOCKUPS,
  placedBox,
  placementAt,
  startPlacement,
  TEMPLATE_SLOTS,
} from "../src/lib/designs/mockups.ts";

const contains = (outer, inner) =>
  inner.left >= outer.left - 0.01 &&
  inner.top >= outer.top - 0.01 &&
  inner.left + inner.width <= outer.left + outer.width + 0.01 &&
  inner.top + inner.height <= outer.top + outer.height + 0.01;

const near = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance;

describe("garment zone", () => {
  it("every built-in template has a garment zone that holds its print area", () => {
    for (const { kind, tone, side } of TEMPLATE_SLOTS) {
      const template = mockupTemplate(kind, tone, side);
      assert.ok(contains(template.garment, template.area), `${kind}-${tone}-${side}`);
      assert.ok(contains({ left: 0, top: 0, width: 1080, height: 1080 }, template.garment), `${kind}-${tone}-${side} inside the photo`);
    }
  });

  it("garments are larger than the print area; the mug and the sticker only move inside it", () => {
    for (const kind of ["tshirt", "oversize", "tank"]) {
      const template = mockupTemplate(kind, "dark", "back");
      assert.ok(template.garment.width > template.area.width && template.garment.height > template.area.height, kind);
    }
    for (const kind of ["mug", "sticker"]) {
      const template = mockupTemplate(kind, "light", "front");
      assert.deepEqual(template.garment, template.area, kind);
    }
  });

  it("an uploaded photo without its own zone uses the built-in one, grown to hold its print area", () => {
    const area = { left: 100, top: 120, width: 300, height: 375 };
    const template = mockupTemplate("tshirt", "dark", "front", { "tshirt-dark-front": { src: "/x.png", area } });
    const builtIn = mockupTemplate("tshirt", "dark", "front").garment;
    assert.ok(contains(template.garment, area));
    assert.ok(contains(template.garment, builtIn));
  });

  it("an uploaded photo's own zone wins, and still holds its print area", () => {
    const area = { left: 400, top: 300, width: 280, height: 350 };
    const garment = { left: 300, top: 200, width: 480, height: 700 };
    const template = mockupTemplate("tank", "light", "back", { "tank-light-back": { src: "/x.png", area, garment } });
    assert.deepEqual(template.garment, garment);
    const tooSmall = mockupTemplate("tank", "light", "back", {
      "tank-light-back": { src: "/x.png", area, garment: { left: 450, top: 350, width: 100, height: 100 } },
    });
    assert.deepEqual(tooSmall.garment, area);
  });
});

describe("design placement in cm", () => {
  const template = mockupTemplate("tshirt", "dark", "front");

  it("starts where the design sat before: centred on the side's print area at the kind's usual size", () => {
    for (const aspect of [1, 2400 / 3040, 2]) {
      const start = startPlacement("tshirt", template, "front", aspect);
      const old = designBox("tshirt", defaultPlacement("tshirt", aspect), aspect);
      const box = placedBox("tshirt", template, start, aspect);
      const { area } = template;
      assert.equal(start.side, "front");
      assert.ok(near(box.left, area.left + old.left * area.width), `left, aspect ${aspect}`);
      assert.ok(near(box.top, area.top + old.top * area.height), `top, aspect ${aspect}`);
      assert.ok(near(box.width, old.width * area.width), `width, aspect ${aspect}`);
    }
  });

  it("measures the width in cm from the print area", () => {
    const start = startPlacement("tshirt", template, "front", 1);
    assert.equal(start.widthCm, Math.round(MOCKUPS.tshirt.start.scale * MOCKUPS.tshirt.printCm.width * 10) / 10);
    assert.ok(near(placedBox("tshirt", template, start, 1).width * cmPerPx("tshirt", template), start.widthCm, 0.1));
  });

  it("caps the width at 30 cm and keeps a minimum", () => {
    const start = startPlacement("tshirt", template, "front", 1);
    assert.equal(clampGarmentPlacement("tshirt", template, { ...start, widthCm: 80 }, 1).widthCm, DESIGN_CM.max);
    assert.equal(clampGarmentPlacement("tshirt", template, { ...start, widthCm: 0 }, 1).widthCm, DESIGN_CM.min);
  });

  it("can leave the print area but never the garment zone", () => {
    const start = startPlacement("tshirt", template, "front", 1);
    const low = placementAt("tshirt", template, start, 1, { x: 540, y: template.garment.top + template.garment.height - 20 });
    const box = placedBox("tshirt", template, low, 1);
    assert.ok(box.top + box.height > template.area.top + template.area.height, "below the print area");
    assert.ok(contains(template.garment, box), "inside the garment");
    const far = clampGarmentPlacement("tshirt", template, { ...start, xCm: 500, yCm: -500 }, 1);
    assert.ok(contains(template.garment, placedBox("tshirt", template, far, 1)));
  });

  it("moves the design's centre to a point of the photo", () => {
    const start = startPlacement("tshirt", template, "front", 1);
    const point = { x: template.garment.left + template.garment.width / 2 + 30, y: template.garment.top + 300 };
    const box = placedBox("tshirt", template, placementAt("tshirt", template, start, 1, point), 1);
    assert.ok(near(box.left + box.width / 2, point.x, 1.5));
    assert.ok(near(box.top + box.height / 2, point.y, 1.5));
  });

  it("the mug keeps the design inside its print band and its size", () => {
    const mug = mockupTemplate("mug", "light", "front");
    const start = startPlacement("mug", mug, "front", 1);
    const big = clampGarmentPlacement("mug", mug, { ...start, widthCm: 30 }, 1);
    assert.ok(big.widthCm <= MOCKUPS.mug.printCm.width);
    assert.ok(contains(mug.area, placedBox("mug", mug, big, 1)));
  });

  it("the same placement lands on the same spot of the garment on every color", () => {
    const start = startPlacement("tshirt", template, "back", 1);
    const white = mockupTemplate("tshirt", "light", "back");
    const box = placedBox("tshirt", white, clampGarmentPlacement("tshirt", white, start, 1), 1);
    assert.ok(contains(white.garment, box));
  });
});

describe("placement in the browser cart", async () => {
  const { addLine, lineKey, parseCart, removeLine, setQuantity } = await import("../src/lib/cart.ts");
  const { parseGarmentPlacement, placementKey } = await import("../src/lib/designs/mockups.ts");
  const designId = "11111111-2222-4333-8444-555555555555";
  const front = { side: "front", widthCm: 20, xCm: 0, yCm: 8 };
  const back = { side: "back", widthCm: 28, xCm: -2.5, yCm: 6 };

  it("reads a valid placement, rounded to 0.1 cm", () => {
    assert.deepEqual(parseGarmentPlacement({ side: "back", widthCm: 20.04, xCm: -0.04, yCm: 7.96 }), { side: "back", widthCm: 20, xCm: 0, yCm: 8 });
  });

  it("rejects anything else", () => {
    for (const value of [
      null,
      "front",
      [],
      { side: "left", widthCm: 20, xCm: 0, yCm: 0 },
      { side: "front", widthCm: 31, xCm: 0, yCm: 0 },
      { side: "front", widthCm: 0.5, xCm: 0, yCm: 0 },
      { side: "front", widthCm: 20, xCm: 61, yCm: 0 },
      { side: "front", widthCm: 20, xCm: 0, yCm: -1 },
      { side: "front", widthCm: 20, xCm: 0, yCm: 101 },
      { side: "front", widthCm: "20", xCm: 0, yCm: 0 },
      { side: "front", widthCm: Number.NaN, xCm: 0, yCm: 0 },
      { side: "front", widthCm: 20, xCm: 0, yCm: 0, kind: "mug" },
      { side: "front", widthCm: 20, xCm: 0 },
    ]) {
      assert.equal(parseGarmentPlacement(value), null, JSON.stringify(value));
    }
  });

  it("the same design placed two ways makes two lines; the same placement adds up", () => {
    let lines = addLine([], "remera", 1, "R-M", designId, front);
    lines = addLine(lines, "remera", 2, "R-M", designId, back);
    lines = addLine(lines, "remera", 1, "R-M", designId, { ...front });
    assert.deepEqual(lines, [
      { productId: "remera", quantity: 2, sku: "R-M", designId, placement: front },
      { productId: "remera", quantity: 2, sku: "R-M", designId, placement: back },
    ]);
    assert.notEqual(lineKey("remera", "R-M", designId, front), lineKey("remera", "R-M", designId, back));
    assert.equal(setQuantity(lines, "remera", 5, "R-M", designId, back)[1].quantity, 5);
    assert.deepEqual(removeLine(lines, "remera", "R-M", designId, front), [lines[1]]);
  });

  it("a placement without a design is ignored", () => {
    assert.deepEqual(addLine([], "remera", 1, "R-M", undefined, front), [{ productId: "remera", quantity: 1, sku: "R-M" }]);
  });

  it("lines saved before placements keep working, and a broken placement is dropped", () => {
    const raw = JSON.stringify([
      { productId: "remera", quantity: 1, designId },
      { productId: "remera", quantity: 1, designId, placement: { side: "front", widthCm: 99, xCm: 0, yCm: 0 } },
      { productId: "remera", quantity: 3, designId, placement: back },
      { productId: "taza", quantity: 1, placement: back },
    ]);
    assert.deepEqual(parseCart(raw), [
      { productId: "remera", quantity: 1, designId },
      { productId: "remera", quantity: 1, designId },
      { productId: "remera", quantity: 3, designId, placement: back },
      { productId: "taza", quantity: 1 },
    ]);
    assert.equal(placementKey(undefined), "");
  });
});
