/**
 * Mockup geometry for the design catalog: the template photo each base product
 * kind is previewed on, where the design can sit on it, and where it starts.
 * Shared by the browser (live preview) and the server.
 *
 * Every template is a TEMPLATE_PX square. The T-shirt reuses the Custom Lab
 * templates, and so does the oversize T-shirt until its own photos are uploaded; the tank top photos, the rendered mug, the sticker surface and every
 * warp map come from scripts/generate-mockups.mjs (run it again after changing a
 * template, a print area or a warp scale).
 *
 * Admin › Soportes can replace any of these built-in templates with an uploaded
 * photo (TemplateOverrides, stored in mockup_templates).
 */
import { garmentBox, PRINT_AREA_CM, printArea, SCALE_RANGE, shirtTemplateSrc, TEMPLATE_PX, type Placement } from "../lab/tshirt.ts";
import type { MockupKind } from "./kinds.ts";

export { TEMPLATE_PX, type Placement };

export const MOCKUP_TONES = ["light", "dark"] as const;
export const MOCKUP_SIDES = ["front", "back"] as const;
export type MockupTone = (typeof MOCKUP_TONES)[number];
export type MockupSide = (typeof MOCKUP_SIDES)[number];

export const MOCKUP_SIDE_LABELS: Record<MockupSide, string> = { front: "Frente", back: "Espalda" };

/** A rectangle in template pixels. */
export type Box = { left: number; top: number; width: number; height: number };

/**
 * Bends the flat design onto the product: `map` is an SVG feDisplacementMap
 * (fabric folds, the mug's curve) sized like the print area, `shade` the light
 * and shadow laid back over the ink, `scale` the displacement in template pixels.
 */
export type Warp = { map: string; shade: string; scale: number };

export type MockupTemplate = {
  src: string;
  /** The print area, in template pixels: where a design starts, and the cm scale (its width is the kind's printCm width). */
  area: Box;
  /**
   * The garment zone, in template pixels: where the customer can move a design on
   * the store's design page. It always holds the print area; on the mug and the
   * sticker it is the print area itself.
   */
  garment: Box;
  /** "multiply" lets the fabric or ceramic show through the ink on light templates. */
  blend: "multiply" | "normal";
  warp?: Warp;
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
  /** Garments let a design move over the whole garment zone; the mug and the sticker keep it in the print area. */
  freePlacement: boolean;
  templates: Partial<Record<`${MockupTone}-${MockupSide}`, { src: string; area: Box; garment: Box; warp?: Warp }>>;
};

/** A box centred horizontally at `centerX`, `width` wide, with the print proportion. */
function areaOf(centerX: number, top: number, width: number, printCm: { width: number; height: number }): Box {
  return { left: Math.round(centerX - width / 2), top, width, height: Math.round((width * printCm.height) / printCm.width) };
}

const TANK_CM = { width: 24, height: 30 } as const;
const MUG_CM = { width: 9, height: 8 } as const;
const STICKER_CM = { width: 8, height: 8 } as const;

/** How far fabric folds shift the print, in template pixels. */
export const FABRIC_WARP_PX = 10;
const warp = (name: string, scale: number): Warp => ({
  map: `/lab/mockups/warp/${name}-map.png`,
  shade: `/lab/mockups/warp/${name}-shade.png`,
  scale,
});

const shirt = (tone: MockupTone, side: MockupSide) => {
  const color = tone === "dark" ? "black" : "white";
  return {
    src: shirtTemplateSrc(color, side),
    area: printArea(color, side),
    garment: garmentBox(color, side),
    warp: warp(`tshirt-${tone}-${side}`, FABRIC_WARP_PX),
  };
};

const tank = (tone: MockupTone, side: MockupSide) => ({
  // One photo per color; the back print sits a little higher, under the shallower neckline.
  src: `/lab/mockups/tank-${tone === "dark" ? "black" : "white"}.png`,
  // The tank top body spans x 288–792, y 157–922; the front neckline bottoms out near y 260.
  area: areaOf(540, side === "front" ? 300 : 270, 260, TANK_CM),
  // The body below the straps and armholes, down to the hem.
  garment: { left: 300, top: side === "front" ? 250 : 220, width: 480, height: (side === "front" ? 660 : 690) },
  warp: warp(`tank-${tone}-${side}`, FABRIC_WARP_PX),
});

/** The rendered mug: its print band (9 × 8 cm around the body) fits inside this box; see the script. */
const MUG_AREA: Box = { left: 200, top: 200, width: 700, height: 700 };
const MUG_WARP_PX = 1000;

/** The classic T-shirt; the oversize one shares its photos, print size and start until Soportes has oversize photos. */
const SHIRT_MOCKUP: KindMockup = {
  sides: ["front", "back"],
  tones: ["light", "dark"],
  printCm: PRINT_AREA_CM,
  start: { scale: 0.7, y: 0.35 },
  multiplyOnLight: true,
  freePlacement: true,
  templates: {
    "light-front": shirt("light", "front"),
    "light-back": shirt("light", "back"),
    "dark-front": shirt("dark", "front"),
    "dark-back": shirt("dark", "back"),
  },
};

export const MOCKUPS: Record<MockupKind, KindMockup> = {
  tshirt: SHIRT_MOCKUP,
  oversize: SHIRT_MOCKUP,
  tank: {
    sides: ["front", "back"],
    tones: ["light", "dark"],
    printCm: TANK_CM,
    start: { scale: 0.7, y: 0.4 },
    multiplyOnLight: true,
    freePlacement: true,
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
    freePlacement: false,
    // The print band wraps around the body; the box only bounds it (see MUG_AREA).
    templates: {
      "light-front": { src: "/lab/mockups/mug-white.png", area: MUG_AREA, garment: MUG_AREA, warp: warp("mug-light-front", MUG_WARP_PX) },
    },
  },
  sticker: {
    sides: ["front"],
    tones: ["light"],
    printCm: STICKER_CM,
    start: { scale: 1, y: 0.5 },
    multiplyOnLight: false,
    freePlacement: false,
    templates: {
      "light-front": { src: "/lab/mockups/sticker-surface.png", area: areaOf(540, 290, 500, STICKER_CM), garment: areaOf(540, 290, 500, STICKER_CM) },
    },
  },
};

/**
 * One template of a kind: a tone and a side. The tone is "light" or "dark" (the
 * generic templates) or a garment color key (see colorKey) for a color's own photo.
 */
export type TemplateSlot = { kind: MockupKind; tone: string; side: MockupSide };
export type TemplateSlotKey = `${MockupKind}-${string}-${MockupSide}`;

/** An uploaded template that replaces the built-in one of its slot; without its own garment zone it uses the built-in one. */
export type TemplateOverride = { src: string; area: Box; garment?: Box; warp?: Warp };
export type TemplateOverrides = Partial<Record<TemplateSlotKey, TemplateOverride>>;

export const slotKey = ({ kind, tone, side }: TemplateSlot): TemplateSlotKey => `${kind}-${tone}-${side}`;

/** The generic tone a slot's tone stands for: itself, or the tone of its color key. */
export const slotTone = (tone: string): MockupTone =>
  (MOCKUP_TONES as readonly string[]).includes(tone) ? (tone as MockupTone) : toneOfColor(tone);

/** Every generic (light / dark) slot the kinds declare, in kind, tone, side order. */
export const TEMPLATE_SLOTS: TemplateSlot[] = (Object.keys(MOCKUPS) as MockupKind[]).flatMap((kind) =>
  MOCKUPS[kind].tones.flatMap((tone) => MOCKUPS[kind].sides.map((side) => ({ kind, tone, side }))),
);

/** Kinds that come in several garment colors (their base product has a Color option). */
export const hasGarmentColors = (kind: MockupKind) => MOCKUPS[kind].tones.length > 1;

/** A generic slot, or a color slot of a kind that comes in colors. */
export const isTemplateSlot = (kind: string, tone: string, side: string): kind is MockupKind =>
  TEMPLATE_SLOTS.some((slot) => slot.kind === kind && slot.tone === tone && slot.side === side) ||
  (TEMPLATE_SLOTS.some((slot) => slot.kind === kind && slot.side === side) &&
    hasGarmentColors(kind as MockupKind) &&
    COLOR_KEY.test(tone));

/**
 * The template for a kind; a tone or side the kind does not have falls back to
 * its first one. With a garment `color` (its key), that color's uploaded photo
 * wins; otherwise the uploaded template of the tone, then the built-in one.
 */
export function mockupTemplate(
  kind: MockupKind,
  tone: MockupTone,
  side: MockupSide,
  overrides?: TemplateOverrides,
  color?: string | null,
): MockupTemplate {
  const mockup = MOCKUPS[kind];
  const t = mockup.tones.includes(tone) ? tone : mockup.tones[0];
  const s = mockup.sides.includes(side) ? side : mockup.sides[0];
  const own = color && hasGarmentColors(kind) ? overrides?.[slotKey({ kind, tone: color, side: s })] : undefined;
  const builtIn = mockup.templates[`${t}-${s}`]!;
  const template: TemplateOverride = own ?? overrides?.[slotKey({ kind, tone: t, side: s })] ?? builtIn;
  const garment = mockup.freePlacement ? coverBox(template.garment ?? builtIn.garment, template.area) : template.area;
  return { ...template, garment, blend: t === "light" && mockup.multiplyOnLight ? "multiply" : "normal" };
}

/** The smallest box that holds `box` and `inner`. */
function coverBox(box: Box, inner: Box): Box {
  const left = Math.min(box.left, inner.left);
  const top = Math.min(box.top, inner.top);
  return {
    left,
    top,
    width: Math.max(box.left + box.width, inner.left + inner.width) - left,
    height: Math.max(box.top + box.height, inner.top + inner.height) - top,
  };
}

/** Smallest print area the admin can mark, in template pixels. */
export const MIN_AREA_PX = 80;

/**
 * A print area the admin marked on an uploaded photo, made valid: the kind's
 * print proportion (from its width), at least MIN_AREA_PX wide and inside the template.
 */
export function fitTemplateArea(kind: MockupKind, box: { left: number; top: number; width: number }): Box {
  const { printCm } = MOCKUPS[kind];
  const ratio = printCm.height / printCm.width;
  const num = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback);
  const maxWidth = Math.min(TEMPLATE_PX, Math.floor(TEMPLATE_PX / ratio));
  const width = Math.round(Math.min(maxWidth, Math.max(MIN_AREA_PX, num(box.width, TEMPLATE_PX / 2))));
  const height = Math.min(TEMPLATE_PX, Math.round(width * ratio));
  const left = Math.round(Math.min(TEMPLATE_PX - width, Math.max(0, num(box.left, 0))));
  const top = Math.round(Math.min(TEMPLATE_PX - height, Math.max(0, num(box.top, 0))));
  return { left, top, width, height };
}

/** Where the print area starts on a newly uploaded photo: the built-in one, refitted to the print proportion. */
export function startingArea(slot: TemplateSlot): Box {
  const { area } = mockupTemplate(slot.kind, slotTone(slot.tone), slot.side);
  const fitted = fitTemplateArea(slot.kind, { left: area.left, top: area.top, width: area.width });
  // The built-in mug area bounds the whole rendered band; on a photo start with the front of the mug.
  return slot.kind === "mug" ? fitTemplateArea("mug", { left: 340, top: 330, width: 400 }) : fitted;
}

/** Mug photos: how much of the cylinder the print area spans (0 flat … 1 half the mug). */
export const DEFAULT_MUG_CURVE = 0.7;

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const DARK_WORDS = ["negro", "negra", "black", "oscuro", "oscura", "marino"];

/** A garment color key: lowercase, no accents, words joined by "-" (same rule as the database CHECK). */
export const COLOR_KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Verde Agua" → "verde-agua", "Negro" → "negro"; "" when the name has no letters or digits. */
export function colorKey(name: string): string {
  return normalize(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/** The value of the variant's option named "Color" (any case or accents), or null. */
export function variantColor(options: Record<string, string>): string | null {
  const value = Object.entries(options).find(([name]) => normalize(name).trim() === "color")?.[1]?.trim();
  return value ? value : null;
}

/** "dark" when the color name is black or dark, so a color without its own photo uses the dark template. */
export function toneOfColor(color: string | null): MockupTone {
  if (!color) return "light";
  const value = normalize(color);
  return DARK_WORDS.some((word) => value.includes(word)) ? "dark" : "light";
}

/** A garment color: its key (stored) and the name the base product's variants show. */
export type GarmentColor = { key: string; label: string };

/** The distinct colors of a list of variants, in their order; variants without a Color option add none. */
export function garmentColors(variants: readonly { options: Record<string, string> }[]): GarmentColor[] {
  const colors = new Map<string, GarmentColor>();
  for (const { options } of variants) {
    const label = variantColor(options);
    const key = label ? colorKey(label) : "";
    if (key && !colors.has(key)) colors.set(key, { key, label: label! });
  }
  return [...colors.values()];
}

/** "dark" when the variant's Color option is black or dark, so the preview uses the dark template. */
export const toneOfVariant = (options: Record<string, string>): MockupTone => toneOfColor(variantColor(options));

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

/**
 * The design's rectangle inside the print area, as fractions of the area (0–1):
 * the flat artwork before a warp bends it onto the product.
 */
export function designBox(kind: MockupKind, p: Placement, designAspect: number) {
  const { printCm } = MOCKUPS[kind];
  const aspect = designAspect > 0 && Number.isFinite(designAspect) ? designAspect : 1;
  const height = (p.scale / aspect) * (printCm.width / printCm.height);
  return { left: p.x - p.scale / 2, top: p.y - height / 2, width: p.scale, height };
}

/** Printed width of a catalog design on the store's design page, in cm (the owner's base price covers up to 30 cm). */
export const DESIGN_CM = { min: 4, max: 30 } as const;

/**
 * Where the customer placed a catalog design, in cm, independent of the photo:
 * the side, the printed width, the horizontal offset of the design's centre from
 * the garment's centre line (positive = to the right as seen) and the distance
 * from the top of the garment zone (the collar) down to the design's top edge.
 */
export type GarmentPlacement = { side: MockupSide; widthCm: number; xCm: number; yCm: number };

const round1 = (n: number) => Math.round(n * 10) / 10;
const safeAspect = (aspect: number) => (aspect > 0 && Number.isFinite(aspect) ? aspect : 1);
const finite = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback);

/** Centimetres per template pixel on a template: its print area is the kind's printCm wide. */
export const cmPerPx = (kind: MockupKind, template: MockupTemplate) => MOCKUPS[kind].printCm.width / template.area.width;

/** The design's rectangle on the template, in template pixels. */
export function placedBox(kind: MockupKind, template: MockupTemplate, p: GarmentPlacement, aspect: number): Box {
  const perPx = cmPerPx(kind, template);
  const width = p.widthCm / perPx;
  const height = width / safeAspect(aspect);
  const { garment } = template;
  return { left: garment.left + garment.width / 2 + p.xCm / perPx - width / 2, top: garment.top + p.yCm / perPx, width, height };
}

/** A placement made valid: width between DESIGN_CM (and what fits), the whole design inside the garment zone. */
export function clampGarmentPlacement(kind: MockupKind, template: MockupTemplate, p: GarmentPlacement, aspect: number): GarmentPlacement {
  const perPx = cmPerPx(kind, template);
  const ratio = safeAspect(aspect);
  const garmentW = template.garment.width * perPx;
  const garmentH = template.garment.height * perPx;
  const max = Math.min(DESIGN_CM.max, garmentW, garmentH * ratio);
  const min = Math.min(DESIGN_CM.min, max);
  // Values are kept to 0.1 cm; limits round inwards so the rounded design still fits.
  const floor1 = (n: number) => Math.floor(n * 10 + 1e-9) / 10;
  const within = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));
  const widthCm = within(round1(within(finite(p.widthCm, min), min, max)), floor1(min), floor1(max));
  const maxX = floor1(Math.max(0, (garmentW - widthCm) / 2));
  const maxY = floor1(Math.max(0, garmentH - widthCm / ratio));
  return {
    side: p.side,
    widthCm,
    xCm: within(round1(finite(p.xCm, 0)), -maxX, maxX),
    yCm: within(round1(finite(p.yCm, 0)), 0, maxY),
  };
}

/** Where a design starts on a side: centred on that side's print area, at the kind's usual size. */
export function startPlacement(kind: MockupKind, template: MockupTemplate, side: MockupSide, aspect: number): GarmentPlacement {
  const fraction = defaultPlacement(kind, aspect);
  const { area, garment } = template;
  const perPx = cmPerPx(kind, template);
  const box = designBox(kind, fraction, aspect);
  const centerX = area.left + fraction.x * area.width;
  const top = area.top + box.top * area.height;
  return clampGarmentPlacement(
    kind,
    template,
    { side, widthCm: fraction.scale * area.width * perPx, xCm: (centerX - garment.left - garment.width / 2) * perPx, yCm: (top - garment.top) * perPx },
    aspect,
  );
}

/** The placement with the design's centre moved to a point of the template (in template pixels), kept valid. */
export function placementAt(
  kind: MockupKind,
  template: MockupTemplate,
  p: GarmentPlacement,
  aspect: number,
  center: { x: number; y: number },
): GarmentPlacement {
  const perPx = cmPerPx(kind, template);
  const heightCm = p.widthCm / safeAspect(aspect);
  const { garment } = template;
  return clampGarmentPlacement(
    kind,
    template,
    { ...p, xCm: (center.x - garment.left - garment.width / 2) * perPx, yCm: (center.y - garment.top) * perPx - heightCm / 2 },
    aspect,
  );
}

/** Printed height in cm of a placement. */
export const placementHeightCm = (p: GarmentPlacement, aspect: number) => round1(p.widthCm / safeAspect(aspect));

/** Loose bounds of a stored placement, in cm: the server cannot see the photo, so it only checks sane values. */
export const PLACEMENT_BOUNDS = { xCm: 60, yCm: 100 } as const;

/**
 * A placement read from untrusted data (the browser's cart, a request), rounded
 * to 0.1 cm; null when it is not exactly { side, widthCm, xCm, yCm } in bounds.
 */
export function parseGarmentPlacement(value: unknown): GarmentPlacement | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { side, widthCm, xCm, yCm, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length) return null;
  if (!(MOCKUP_SIDES as readonly unknown[]).includes(side)) return null;
  const numbers = [widthCm, xCm, yCm];
  if (!numbers.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const [w, x, y] = (numbers as number[]).map(round1);
  if (w < 1 || w > DESIGN_CM.max || Math.abs(x) > PLACEMENT_BOUNDS.xCm || y < 0 || y > PLACEMENT_BOUNDS.yCm) return null;
  return { side: side as MockupSide, widthCm: w, xCm: x === 0 ? 0 : x, yCm: y };
}

/** Stable text of a placement, so the same design placed differently makes separate cart lines. */
export const placementKey = (p?: GarmentPlacement | null) => (p ? `${p.side}:${p.widthCm}:${p.xCm}:${p.yCm}` : "");
