/**
 * Custom Lab T-shirts: shared by the editor (browser) and the server, which
 * validates every value again and builds the final files.
 */

export const SHIRT_COLORS = { black: "Negra", white: "Blanca" } as const;
export const SHIRT_SIDES = { front: "Frente", back: "Espalda" } as const;
export const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

export type ShirtColor = keyof typeof SHIRT_COLORS;
export type ShirtSide = keyof typeof SHIRT_SIDES;

/** Printable area of a garment (DTF): the design can be placed anywhere inside it. */
export const PRINT_AREA_CM = { width: 28, height: 35 } as const;

/** Catalog prints (public/lab/designs, from scripts/generate-lab-designs.mjs). */
export const CATALOG_DESIGNS = [
  { id: "ruido-visual", name: "Ruido Visual" },
  { id: "otro-planeta", name: "Otro Planeta" },
  { id: "gato-mutante", name: "Gato Mutante" },
  { id: "bestia", name: "Bestia" },
] as const;

/** Light ink on black shirts, dark ink on white ones. */
export const catalogDesignSrc = (id: string, color: ShirtColor) => `/lab/designs/${id}-${color === "black" ? "claro" : "oscuro"}.png`;

export const shirtTemplateSrc = (color: ShirtColor, side: ShirtSide) => `/lab/shirts/${color}-${side}.png`;

/** Template photos are 1080 × 1080; the garment box was measured from each one (sharp trim). */
export const TEMPLATE_PX = 1080;
const GARMENT: Record<`${ShirtColor}-${ShirtSide}`, { left: number; top: number; width: number; height: number }> = {
  "black-front": { left: 228, top: 154, width: 624, height: 706 },
  "black-back": { left: 185, top: 85, width: 651, height: 811 },
  "white-front": { left: 234, top: 179, width: 613, height: 751 },
  "white-back": { left: 238, top: 175, width: 603, height: 740 },
};

/** Print area on the template photo, in its pixels: centred on the chest (or upper back). */
export function printArea(color: ShirtColor, side: ShirtSide) {
  const box = GARMENT[`${color}-${side}`];
  const width = Math.round(box.width * 0.46);
  const height = Math.round((width * PRINT_AREA_CM.height) / PRINT_AREA_CM.width);
  return {
    left: Math.round(box.left + box.width / 2 - width / 2),
    top: Math.round(box.top + box.height * (side === "front" ? 0.25 : 0.22)),
    width,
    height,
  };
}

/**
 * Where the design sits inside the print area, as fractions: `scale` is its width
 * over the area width (0.2–1); `x`/`y` place its centre (0–1). The design keeps
 * its aspect ratio and is clamped to stay inside the area.
 */
export type Placement = { scale: number; x: number; y: number };

export const SCALE_RANGE = { min: 0.2, max: 1 } as const;

export function clampPlacement(p: Placement, designAspect: number): Placement {
  const scale = Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, p.scale));
  // Height of the design as a fraction of the area height.
  const areaAspect = PRINT_AREA_CM.width / PRINT_AREA_CM.height;
  let s = scale;
  let h = (s / designAspect) * areaAspect;
  if (h > 1) {
    s = s / h;
    h = 1;
  }
  const halfW = s / 2;
  const halfH = h / 2;
  return {
    scale: s,
    x: Math.min(1 - halfW, Math.max(halfW, p.x)),
    y: Math.min(1 - halfH, Math.max(halfH, p.y)),
  };
}

/** Printed width in centimetres for a placement. */
export const printWidthCm = (p: Placement) => Math.round(p.scale * PRINT_AREA_CM.width * 10) / 10;
