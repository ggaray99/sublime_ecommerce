// Design catalog mockups: every base product kind has a template per tone and side,
// a print area inside it, and a default placement that stays inside that area.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { MOCKUP_KINDS } from "../src/lib/designs/kinds.ts";
import {
  clampMockupPlacement,
  defaultPlacement,
  MOCKUPS,
  mockupTemplate,
  TEMPLATE_PX,
  toneOfVariant,
} from "../src/lib/designs/mockups.ts";
import { printArea, shirtTemplateSrc } from "../src/lib/lab/tshirt.ts";

const publicFile = (src) => join(import.meta.dirname, "..", "public", ...src.split("/").filter(Boolean));

describe("mockup templates", () => {
  it("declares every kind, with sides and tones", () => {
    assert.deepEqual(Object.keys(MOCKUPS).sort(), [...MOCKUP_KINDS].sort());
    assert.deepEqual(MOCKUPS.tshirt.sides, ["front", "back"]);
    assert.deepEqual(MOCKUPS.tank.sides, ["front", "back"]);
    assert.deepEqual(MOCKUPS.mug.sides, ["front"]);
    assert.deepEqual(MOCKUPS.sticker.sides, ["front"]);
    assert.deepEqual(MOCKUPS.tshirt.tones, ["light", "dark"]);
    assert.deepEqual(MOCKUPS.tank.tones, ["light", "dark"]);
  });

  it("has an existing image and a print area inside it for each tone and side it declares", () => {
    for (const kind of MOCKUP_KINDS) {
      for (const tone of MOCKUPS[kind].tones) {
        for (const side of MOCKUPS[kind].sides) {
          const template = mockupTemplate(kind, tone, side);
          assert.ok(existsSync(publicFile(template.src)), `${kind} ${tone} ${side}: ${template.src} is missing`);
          const { left, top, width, height } = template.area;
          assert.ok(width > 0 && height > 0, `${kind} ${tone} ${side}: empty print area`);
          assert.ok(left >= 0 && top >= 0 && left + width <= TEMPLATE_PX && top + height <= TEMPLATE_PX, `${kind} ${tone} ${side}: print area outside the template`);
        }
      }
    }
  });

  it("reuses the T-shirt lab templates and print areas", () => {
    assert.equal(mockupTemplate("tshirt", "dark", "back").src, shirtTemplateSrc("black", "back"));
    assert.deepEqual(mockupTemplate("tshirt", "light", "front").area, printArea("white", "front"));
  });

  it("falls back to a declared tone and side", () => {
    assert.equal(mockupTemplate("mug", "dark", "back").src, mockupTemplate("mug", "light", "front").src);
  });

  it("multiplies the design on light garments and mugs only", () => {
    assert.equal(mockupTemplate("tshirt", "light", "front").blend, "multiply");
    assert.equal(mockupTemplate("tank", "light", "back").blend, "multiply");
    assert.equal(mockupTemplate("mug", "light", "front").blend, "multiply");
    assert.equal(mockupTemplate("tshirt", "dark", "front").blend, "normal");
    assert.equal(mockupTemplate("tank", "dark", "front").blend, "normal");
    // A sticker is printed on white vinyl that sits on top of the surface.
    assert.equal(mockupTemplate("sticker", "light", "front").blend, "normal");
  });
});

describe("toneOfVariant", () => {
  it("is dark for black or dark colors, ignoring case and accents", () => {
    assert.equal(toneOfVariant({ Color: "Negro" }), "dark");
    assert.equal(toneOfVariant({ Talle: "M", color: "NEGRA" }), "dark");
    assert.equal(toneOfVariant({ Color: "Black" }), "dark");
    assert.equal(toneOfVariant({ Colór: "Gris oscuro" }), "dark");
  });

  it("is light otherwise", () => {
    assert.equal(toneOfVariant({ Color: "Blanco" }), "light");
    assert.equal(toneOfVariant({ Talle: "Negro" }), "light");
    assert.equal(toneOfVariant({}), "light");
  });
});

describe("placement", () => {
  it("starts inside the print area for any design shape", () => {
    for (const kind of MOCKUP_KINDS) {
      for (const aspect of [0.2, 0.75, 1, 3, 10]) {
        const p = defaultPlacement(kind, aspect);
        assert.ok(p.scale > 0 && p.scale <= 1, `${kind} ${aspect}: scale ${p.scale}`);
        assert.ok(p.x - p.scale / 2 >= -1e-9 && p.x + p.scale / 2 <= 1 + 1e-9, `${kind} ${aspect}: x ${p.x}`);
        assert.ok(p.y >= 0 && p.y <= 1, `${kind} ${aspect}: y ${p.y}`);
        assert.deepEqual(clampMockupPlacement(kind, p, aspect), p, `${kind} ${aspect}: default is not stable`);
      }
    }
  });

  it("shrinks a tall design so its height fits the area", () => {
    const area = mockupTemplate("mug", "light", "front").area;
    const p = clampMockupPlacement("mug", { scale: 1, x: 0.5, y: 0.5 }, 0.1);
    const heightFraction = ((p.scale * area.width) / 0.1) / area.height;
    assert.ok(heightFraction <= 1 + 1e-9, `height ${heightFraction}`);
  });
});
