import sharp, { type Metadata, type OverlayOptions, type Sharp } from "sharp";
import { CONTOUR_PX, PRINT_DPI, SHEET, type Placement } from "../../lib/lab/sheets.ts";

/**
 * Server-side sticker processing (Custom Lab). The browser preview is only
 * commercial: every production file is rebuilt here from the customer's original.
 *
 * Steps: validate → normalize (EXIF rotation, RGBA) → optional plain background
 * removal → trim → scale to print size (300 dpi) → white contour of 32 px.
 */

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_INPUT_PIXELS = 40_000_000;
/** Below this the print looks soft: we warn. Below MIN_DPI we refuse. */
export const GOOD_DPI = 300;
export const MIN_DPI = 150;

export class StickerError extends Error {}

const mmToPx = (mm: number) => Math.round((mm / 25.4) * PRINT_DPI);

export type PreparedSticker = {
  /** Design at print size (longer side = size), transparent background, no contour. */
  design: Buffer;
  /** Design with the white contour, ready to place on a sheet. */
  withContour: Buffer;
  /** Silhouette of the contour: white = cut inside. Used for the cut-line layer. */
  cutMask: Buffer;
  widthPx: number;
  heightPx: number;
  /** Resolution the original actually gives at the chosen size. */
  dpi: number;
  hadTransparency: boolean;
  backgroundRemoved: boolean;
};

/**
 * Removes a plain or gradient background: region growing from the border pixels.
 * Each background pixel carries a running average of the colours on its path;
 * a neighbour joins when it is close to that average. Slow changes (a gradient)
 * move the average along; quick ones (an anti-aliased outline ramping into the
 * artwork) outrun it and stop the growth. Works on raw RGBA in place.
 */
export function floodRemoveBackground(data: Uint8Array, width: number, height: number, tolerance = 32): number {
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const base = new Float32Array(total * 3);
  let head = 0;
  let tail = 0;
  const FOLLOW = 0.1; // how fast the average follows the path
  const near = (i: number, b: number) =>
    Math.abs(data[i * 4] - base[b * 3]) + Math.abs(data[i * 4 + 1] - base[b * 3 + 1]) + Math.abs(data[i * 4 + 2] - base[b * 3 + 2]);

  const seed = (i: number) => {
    if (visited[i] || data[i * 4 + 3] === 0) return;
    visited[i] = 1;
    base.set([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]], i * 3);
    queue[tail++] = i;
  };
  // Only border pixels that look like the corners seed the fill: artwork touching an edge stays.
  const corners = [0, width - 1, (height - 1) * width, total - 1];
  const cornerLike = (i: number) =>
    corners.some((c) => Math.abs(data[i * 4] - data[c * 4]) + Math.abs(data[i * 4 + 1] - data[c * 4 + 1]) + Math.abs(data[i * 4 + 2] - data[c * 4 + 2]) <= tolerance * 2);
  for (const c of corners) seed(c);
  const grow = (from: number, to: number) => {
    if (visited[to] || data[to * 4 + 3] === 0 || near(to, from) > tolerance * 1.5) return;
    visited[to] = 1;
    for (let k = 0; k < 3; k++) base[to * 3 + k] = base[from * 3 + k] + FOLLOW * (data[to * 4 + k] - base[from * 3 + k]);
    queue[tail++] = to;
  };
  for (let x = 0; x < width; x++) {
    if (cornerLike(x)) seed(x);
    if (cornerLike((height - 1) * width + x)) seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    if (cornerLike(y * width)) seed(y * width);
    if (cornerLike(y * width + width - 1)) seed(y * width + width - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    if (x > 0) grow(i, i - 1);
    if (x < width - 1) grow(i, i + 1);
    if (i >= width) grow(i, i - width);
    if (i < total - width) grow(i, i + width);
  }
  let removed = 0;
  for (let i = 0; i < total; i++) {
    if (visited[i]) {
      data[i * 4 + 3] = 0;
      removed++;
    }
  }
  return removed;
}

/** Bounding box of the pixels whose alpha is above `min`, or null when there are none. */
function opaqueBox(rgba: Uint8Array, width: number, height: number, min: number) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > min) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** 1-D squared Euclidean distance transform (Felzenszwalb & Huttenlocher). */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/**
 * White contour: every pixel within `radius` px (Euclidean) of the opaque
 * artwork. Exact, rounded like a die-cut, and cheap at print size.
 */
function contourMask(alpha: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const INF = 1e12;
  const grid = new Float64Array(width * height);
  for (let i = 0; i < grid.length; i++) grid[i] = alpha[i] >= 128 ? 0 : INF;
  const size = Math.max(width, height);
  const f = new Float64Array(size);
  const d = new Float64Array(size);
  const v = new Int32Array(size);
  const z = new Float64Array(size + 1);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x];
    edt1d(f, height, d, v, z);
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = grid[y * width + x];
    edt1d(f, width, d, v, z);
    for (let x = 0; x < width; x++) grid[y * width + x] = d[x];
  }
  const r2 = radius * radius;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = grid[i] <= r2 || alpha[i] > 0 ? 255 : 0;
  return mask;
}

export async function prepareSticker(
  bytes: Uint8Array,
  options: { sizeCm: number; removeBackground: boolean; tolerance?: number },
): Promise<PreparedSticker> {
  if (bytes.length > MAX_UPLOAD_BYTES) throw new StickerError("La imagen supera los 15 MB.");
  let image: Sharp;
  let meta: Metadata;
  try {
    image = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
    meta = await image.metadata();
  } catch {
    throw new StickerError("No pudimos leer la imagen: subí un PNG, JPG o WebP.");
  }
  if (!meta.format || !["png", "jpeg", "webp"].includes(meta.format)) throw new StickerError("Formato no admitido: subí un PNG, JPG o WebP.");

  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let hadTransparency = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) {
      hadTransparency = true;
      break;
    }
  }
  let backgroundRemoved = false;
  if (options.removeBackground && !hadTransparency) {
    backgroundRemoved = floodRemoveBackground(data, info.width, info.height, options.tolerance) > 0;
  }

  // Trim to the visible artwork: only transparent borders, never a colour the customer kept.
  const box = opaqueBox(data, info.width, info.height, 0);
  if (!box) throw new StickerError("La imagen quedó vacía: probá sin quitar el fondo.");
  const trimmed = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(box)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const longerPx = Math.max(trimmed.info.width, trimmed.info.height);
  const targetLonger = mmToPx(options.sizeCm * 10);
  const dpi = Math.round((longerPx / (options.sizeCm / 2.54)) * 10) / 10;
  if (dpi < MIN_DPI) {
    throw new StickerError(`La imagen tiene poca resolución para ${options.sizeCm} cm (${Math.round(dpi)} dpi). Necesitamos al menos ${MIN_DPI} dpi.`);
  }

  const design = await sharp(trimmed.data, { raw: { width: trimmed.info.width, height: trimmed.info.height, channels: 4 } })
    .resize({ width: trimmed.info.width >= trimmed.info.height ? targetLonger : undefined, height: trimmed.info.height > trimmed.info.width ? targetLonger : undefined })
    .png()
    .toBuffer({ resolveWithObject: true });

  // Canvas grown by the contour (plus a little room); trimmed to the contour below.
  const pad = CONTOUR_PX + 2;
  const w = design.info.width + 2 * pad;
  const h = design.info.height + 2 * pad;
  const padded = await sharp(design.data).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer();
  const alpha = Buffer.alloc(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = padded[i * 4 + 3];
  const mask = contourMask(alpha, w, h, CONTOUR_PX);

  const white = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    white[i * 4] = 255;
    white[i * 4 + 1] = 255;
    white[i * 4 + 2] = 255;
    white[i * 4 + 3] = mask[i];
  }
  const cut = opaqueBox(white, w, h, 0) ?? { left: 0, top: 0, width: w, height: h };
  const withContour = await sharp(
    await sharp(white, { raw: { width: w, height: h, channels: 4 } })
      .composite([{ input: padded, raw: { width: w, height: h, channels: 4 } }])
      .raw()
      .toBuffer(),
    { raw: { width: w, height: h, channels: 4 } },
  )
    .extract(cut)
    .png()
    .toBuffer();
  const cutMask = await sharp(Buffer.from(mask), { raw: { width: w, height: h, channels: 1 } }).extract(cut).png().toBuffer();

  return { design: design.data, withContour, cutMask, widthPx: cut.width, heightPx: cut.height, dpi, hadTransparency, backgroundRemoved };
}

/** A sheet at 300 dpi: stickers with their contour placed as the layout says, plus the corner marks. */
export async function renderSheetPng(placements: Placement[], stickers: Map<string, PreparedSticker>): Promise<Buffer> {
  const W = mmToPx(SHEET.widthMm);
  const H = mmToPx(SHEET.heightMm);
  const layers: OverlayOptions[] = [];
  for (const placement of placements) {
    const sticker = stickers.get(placement.id);
    if (!sticker) continue;
    const input = placement.rotated ? await sharp(sticker.withContour).rotate(90).png().toBuffer() : sticker.withContour;
    layers.push({ input, left: mmToPx(placement.xMm), top: mmToPx(placement.yMm) });
  }
  layers.push(...cornerMarks(W, H));
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite(layers)
    .png()
    .toBuffer();
}

/** Registration crosses centred in each reserved 1.5 cm corner. */
function cornerMarks(W: number, H: number): OverlayOptions[] {
  const size = mmToPx(8);
  const c = mmToPx(SHEET.cornerMm) / 2;
  const cross = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="M${size / 2} 0V${size}M0 ${size / 2}H${size}" stroke="#000" stroke-width="3"/></svg>`,
  );
  return [
    [c, c],
    [W - c, c],
    [c, H - c],
    [W - c, H - c],
  ].map(([x, y]) => ({ input: cross, left: Math.round(x - size / 2), top: Math.round(y - size / 2) }));
}
