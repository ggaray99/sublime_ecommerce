/**
 * Mockup geometry for the design catalog: the template photo each base product
 * kind is previewed on, where the design can sit on it, and where it starts.
 * Shared by the browser (live preview) and the server.
 *
 * Every template is a TEMPLATE_PX square. The T-shirt reuses the Custom Lab
 * templates; tank top, mug and sticker are demo art from scripts/generate-mockups.mjs.
 */
import { PRINT_AREA_CM, printArea, SCALE_RANGE, shirtTemplateSrc, TEMPLATE_PX, type Placement } from "../lab/tshirt.ts";
import type { MockupKind } from "./kinds.ts";

export { TEMPLATE_PX, type Placement };

export const MOCKUP_TONES = ["light", "dark"] as const;
export const MOCKUP_SIDES = ["front", "back"] as const;
export type MockupTone = (typeof MOCKUP_TONES)[number];
export type MockupSide = (typeof MOCKUP_SIDES)[number];

export const MOCKUP_SIDE_LABELS: Record<MockupSide, string> = { front: "Frente", back: "Espalda" };

/** A rectangle in template pixels. */
export type Box = { left: number; top: number; width: number; height: number };

export type MockupTemplate = {
  src: string;
  /** Where the design can be placed, in template pixels. */
  area: Box;
  /** "multiply" lets the fabric or ceramic show through the ink on light templates. */
  blend: "multiply" | "normal";
};

type KindMockup = {
  sides: readonly MockupSide[];
  tones: readonly MockupTone[];
  /** Printable size; its proportion is the print area's on every template of the kind. */
  printCm: { width: number; height: number };
  /** Starting scale and vertical position of a design (see Placement). */
  start: { scale: number; y: number };
  /** A sticker is white vinyl on top of the surface, so it never multiplies. */
  multiplyOnLight: boolean;
  templates: Partial<Record<`${MockupTone}-${MockupSide}`, { src: string; area: Box }>>;
};

/** A box centred horizontally at `centerX`, `width` wide, with the print proportion. */
function areaOf(centerX: number, top: number, width: number, printCm: { width: number; height: number }): Box {
  return { left: Math.round(centerX - width / 2), top, width, height: Math.round((width * printCm.height) / printCm.width) };
}

const TANK_CM = { width: 24, height: 30 } as const;
const MUG_CM = { width: 9, height: 8 } as const;
const STICKER_CM = { width: 8, height: 8 } as const;

const shirt = (tone: MockupTone, side: MockupSide) => {
  const color = tone === "dark" ? "black" : "white";
  return { src: shirtTemplateSrc(color, side), area: printArea(color, side) };
};

const tank = (tone: MockupTone, side: MockupSide) => ({
  src: `/lab/mockups/tank-${tone === "dark" ? "black" : "white"}-${side}.png`,
  // The demo tank top body spans x 300–780; the back neckline is higher.
  area: areaOf(540, side === "front" ? 370 : 330, 250, TANK_CM),
});

export const MOCKUPS: Record<MockupKind, KindMockup> = {
  tshirt: {
    sides: ["front", "back"],
    tones: ["light", "dark"],
    printCm: PRINT_AREA_CM,
    start: { scale: 0.7, y: 0.35 },
    multiplyOnLight: true,
    templates: {
      "light-front": shirt("light", "front"),
      "light-back": shirt("light", "back"),
      "dark-front": shirt("dark", "front"),
      "dark-back": shirt("dark", "back"),
    },
  },
  tank: {
    sides: ["front", "back"],
    tones: ["light", "dark"],
    printCm: TANK_CM,
    start: { scale: 0.7, y: 0.4 },
    multiplyOnLight: true,
    templates: {
      "light-front": tank("light", "front"),
      "light-back": tank("light", "back"),
      "dark-front": tank("dark", "front"),
      "dark-back": tank("dark", "back"),
    },
  },
  mug: {
    sides: ["front"],
    tones: ["light"],
    printCm: MUG_CM,
    start: { scale: 0.8, y: 0.5 },
    multiplyOnLight: true,
    // The demo mug body spans x 250–730, y 270–870 (handle on the right).
    templates: { "light-front": { src: "/lab/mockups/mug-white.png", area: areaOf(490, 400, 360, MUG_CM) } },
  },
  sticker: {
    sides: ["front"],
    tones: ["light"],
    printCm: STICKER_CM,
    start: { scale: 1, y: 0.5 },
    multiplyOnLight: false,
    templates: { "light-front": { src: "/lab/mockups/sticker-surface.png", area: areaOf(540, 290, 500, STICKER_CM) } },
  },
};

/** The template for a kind; a tone or side the kind does not have falls back to its first one. */
export function mockupTemplate(kind: MockupKind, tone: MockupTone, side: MockupSide): MockupTemplate {
  const mockup = MOCKUPS[kind];
  const t = mockup.tones.includes(tone) ? tone : mockup.tones[0];
  const s = mockup.sides.includes(side) ? side : mockup.sides[0];
  const template = mockup.templates[`${t}-${s}`]!;
  return { ...template, blend: t === "light" && mockup.multiplyOnLight ? "multiply" : "normal" };
}

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const DARK_WORDS = ["negro", "negra", "black", "oscuro"];

/** "dark" when the variant's Color option is black or dark, so the preview uses the dark template. */
export function toneOfVariant(options: Record<string, string>): MockupTone {
  const color = Object.entries(options).find(([name]) => normalize(name).trim() === "color")?.[1];
  if (!color) return "light";
  const value = normalize(color);
  return DARK_WORDS.some((word) => value.includes(word)) ? "dark" : "light";
}

/**
 * Same rules as the T-shirt lab: the design keeps its aspect ratio, its width is
 * 0.2–1 of the area and it stays inside the area (taller designs are shrunk).
 */
export function clampMockupPlacement(kind: MockupKind, p: Placement, designAspect: number): Placement {
  const { printCm } = MOCKUPS[kind];
  const areaAspect = printCm.width / printCm.height;
  const aspect = designAspect > 0 && Number.isFinite(designAspect) ? designAspect : 1;
  let s = Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, p.scale));
  let h = (s / aspect) * areaAspect;
  if (h > 1) {
    s = s / h;
    h = 1;
  }
  return {
    scale: s,
    x: Math.min(1 - s / 2, Math.max(s / 2, p.x)),
    y: Math.min(1 - h / 2, Math.max(h / 2, p.y)),
  };
}

/** Where a design starts on a kind: centred, at the kind's usual size. */
export function defaultPlacement(kind: MockupKind, designAspect: number): Placement {
  const { start } = MOCKUPS[kind];
  return clampMockupPlacement(kind, { scale: start.scale, x: 0.5, y: start.y }, designAspect);
}

/** The template's print-area box as CSS percentages of the template. */
export const areaStyle = (area: Box) => {
  const pct = (n: number) => `${(n / TEMPLATE_PX) * 100}%`;
  return { left: pct(area.left), top: pct(area.top), width: pct(area.width), height: pct(area.height) };
};
