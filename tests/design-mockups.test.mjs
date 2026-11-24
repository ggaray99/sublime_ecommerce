// Design catalog mockups: every base product kind has a template per tone and side,
// a print area inside it, and a default placement that stays inside that area.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { join } from "node:path";
import { describe, it } from "node:test";
import { MOCKUP_KINDS } from "../src/lib/designs/kinds.ts";
import {
  clampMockupPlacement,
  defaultPlacement,
  designBox,
  MOCKUPS,
  mockupTemplate,
  TEMPLATE_PX,
  colorKey,
  garmentColors,
  isTemplateSlot,
  toneOfColor,
  toneOfVariant,
  variantColor,
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

  it("leaves the background transparent on every template, so the stage grey is the same behind all products", async () => {
    for (const kind of MOCKUP_KINDS) {
      for (const tone of MOCKUPS[kind].tones) {
        for (const side of MOCKUPS[kind].sides) {
          const { src } = mockupTemplate(kind, tone, side);
          const image = sharp(publicFile(src));
          assert.ok((await image.metadata()).hasAlpha, `${src} has no alpha channel`);
          for (const [left, top] of [[4, 4], [TEMPLATE_PX - 5, 4]]) {
            const [, , , alpha] = await sharp(publicFile(src)).ensureAlpha().extract({ left, top, width: 1, height: 1 }).raw().toBuffer();
            assert.equal(alpha, 0, `${src}: corner ${left},${top} is not transparent`);
          }
        }
      }
    }
  });

  it("bends the design onto garments and the mug with warp maps sized like the print area", async () => {
    for (const kind of ["tshirt", "tank", "mug"]) {
      for (const tone of MOCKUPS[kind].tones) {
        for (const side of MOCKUPS[kind].sides) {
          const { warp, area } = mockupTemplate(kind, tone, side);
          assert.ok(warp && warp.scale > 0, `${kind} ${tone} ${side}: no warp`);
          for (const file of [warp.map, warp.shade]) {
            assert.ok(existsSync(publicFile(file)), `${file} is missing: run node scripts/generate-mockups.mjs`);
            const { width, height } = await sharp(publicFile(file)).metadata();
            assert.deepEqual([width, height], [area.width, area.height], `${file} does not match its print area`);
          }
        }
      }
    }
    // A sticker is flat vinyl: no warp.
    assert.equal(mockupTemplate("sticker", "light", "front").warp, undefined);
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

  it("lays the flat design inside the print area with its own proportion", () => {
    for (const kind of MOCKUP_KINDS) {
      const { printCm } = MOCKUPS[kind];
      for (const aspect of [0.5, 1, 2]) {
        const box = designBox(kind, defaultPlacement(kind, aspect), aspect);
        assert.ok(box.left >= -1e-9 && box.top >= -1e-9 && box.left + box.width <= 1 + 1e-9 && box.top + box.height <= 1 + 1e-9, `${kind} ${aspect}`);
        const cmAspect = (box.width * printCm.width) / (box.height * printCm.height);
        assert.ok(Math.abs(cmAspect - aspect) < 1e-9, `${kind} ${aspect}: printed proportion ${cmAspect}`);
      }
    }
  });

  it("shrinks a tall design so its height fits the area", () => {
    const p = clampMockupPlacement("mug", { scale: 1, x: 0.5, y: 0.5 }, 0.1);
    const heightFraction = designBox("mug", p, 0.1).height;
    assert.ok(heightFraction <= 1 + 1e-9, `height ${heightFraction}`);
  });
});

describe("garment colors", () => {
  it("keys a color name without case, accents or spaces", () => {
    assert.equal(colorKey("Negro"), "negro");
    assert.equal(colorKey("  Verde Agua "), "verde-agua");
    assert.equal(colorKey("Azul Océano"), "azul-oceano");
    assert.equal(colorKey("!!!"), "");
  });

  it("reads the Color option of a variant, ignoring case and accents in its name", () => {
    assert.equal(variantColor({ Talle: "M", Color: "Crema" }), "Crema");
    assert.equal(variantColor({ COLOR: " Negro " }), "Negro");
    assert.equal(variantColor({ Talle: "M" }), null);
  });

  it("lists distinct colors in variant order", () => {
    const variants = [{ options: { Color: "Blanco", Talle: "S" } }, { options: { Color: "Crema", Talle: "S" } }, { options: { color: "blanco", Talle: "M" } }, { options: { Talle: "L" } }];
    assert.deepEqual(garmentColors(variants), [
      { key: "blanco", label: "Blanco" },
      { key: "crema", label: "Crema" },
    ]);
  });

  it("uses the dark template for dark colors without their own photo", () => {
    assert.equal(toneOfColor("Negro"), "dark");
    assert.equal(toneOfColor("Azul marino"), "dark");
    assert.equal(toneOfColor("Crema"), "light");
    assert.equal(toneOfColor(null), "light");
  });

  it("prefers the color's own uploaded photo, then the tone's, then the built-in one", () => {
    const own = { src: "/media/soportes/crema.png", area: { left: 1, top: 2, width: 300, height: 400 } };
    const light = { src: "/media/soportes/light.png", area: { left: 3, top: 4, width: 300, height: 400 } };
    assert.equal(mockupTemplate("tshirt", "light", "front", { "tshirt-crema-front": own, "tshirt-light-front": light }, "crema").src, own.src);
    assert.equal(mockupTemplate("tshirt", "light", "front", { "tshirt-light-front": light }, "crema").src, light.src);
    assert.equal(mockupTemplate("tshirt", "light", "front", {}, "crema").src, MOCKUPS.tshirt.templates["light-front"].src);
    assert.equal(mockupTemplate("tshirt", "light", "front", { "tshirt-crema-front": own }, "crema").blend, "multiply");
    // Single-tone kinds ignore colors.
    assert.equal(mockupTemplate("mug", "light", "front", { "mug-crema-front": own }, "crema").src, MOCKUPS.mug.templates["light-front"].src);
  });

  it("accepts color slots only on kinds that come in colors", () => {
    assert.equal(isTemplateSlot("tshirt", "crema", "front"), true);
    assert.equal(isTemplateSlot("tshirt", "light", "back"), true);
    assert.equal(isTemplateSlot("tshirt", "Crema", "front"), false);
    assert.equal(isTemplateSlot("mug", "crema", "front"), false);
    assert.equal(isTemplateSlot("mug", "light", "back"), false);
  });
});
