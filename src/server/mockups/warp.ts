/**
 * Image work behind mockup templates, shared by scripts/generate-mockups.mjs
 * (built-in templates) and Admin › Soportes (uploaded photos):
 *
 * - cutting a product photo out of its white studio background;
 * - warp maps that bend a flat design onto the product. A map is an SVG
 *   feDisplacementMap sized like the print area: red/green hold where each pixel
 *   reads the flat design from, as (offset / scale + 0.5). Its shade map is grey
 *   around 128, laid over the ink with soft-light; its alpha clips the print.
 */
import sharp from "sharp";
import { TEMPLATE_PX, type Box } from "../../lib/designs/mockups.ts";

export class TemplatePhotoError extends Error {}

export type WarpMaps = { map: Buffer; shade: Buffer; scale: number };

/** Near-white pixels connected to the border are the studio background. */
const BACKGROUND_MIN = 250;

/** Alpha mask of the photo's subject: flood fill of the white background from the edges, softened by a pixel. */
export async function subjectMask(rgb: Uint8Array, width: number, height: number): Promise<Buffer> {
  const background = new Uint8Array(width * height);
  const isWhite = (i: number) => Math.min(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) >= BACKGROUND_MIN;
  const stack: number[] = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (background[i] || !isWhite(i)) continue;
    background[i] = 1;
    const x = i % width;
    if (x > 0) stack.push(i - 1);
    if (x < width - 1) stack.push(i + 1);
    if (i >= width) stack.push(i - width);
    if (i < (height - 1) * width) stack.push(i + width);
  }
  const mask = Buffer.alloc(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = background[i] ? 0 : 255;
  return sharp(mask, { raw: { width, height, channels: 1 } }).blur(0.8).extractChannel(0).raw().toBuffer();
}

/** A product photo on a white background as a TEMPLATE_PX square PNG with that background cut away. */
export async function cutOutWhiteBackground(input: Buffer | string): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .resize(TEMPLATE_PX, TEMPLATE_PX, { fit: "contain", background: "#ffffff" })
    .flatten({ background: "#ffffff" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = await subjectMask(data, info.width, info.height);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } })
    .joinChannel(alpha, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export const MAX_TEMPLATE_PHOTO_BYTES = 15 * 1024 * 1024;
const MIN_TEMPLATE_PHOTO_PX = 600;

/**
 * An uploaded template photo (PNG, JPG or WebP) as a TEMPLATE_PX square PNG with
 * a transparent background: a photo with its own transparency keeps it, an
 * opaque one loses its white studio background. Throws TemplatePhotoError.
 */
export async function prepareTemplatePhoto(bytes: Uint8Array): Promise<Buffer> {
  if (!bytes.length) throw new TemplatePhotoError("El archivo está vacío.");
  if (bytes.length > MAX_TEMPLATE_PHOTO_BYTES) throw new TemplatePhotoError("La foto supera los 15 MB.");
  let metadata;
  let upright: Buffer;
  try {
    // Rotate by EXIF so phone photos are not stored sideways.
    upright = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().png().toBuffer();
    metadata = await sharp(bytes).metadata();
  } catch {
    throw new TemplatePhotoError("No pudimos leer la foto: subí un PNG, JPG o WebP.");
  }
  if (!["png", "jpeg", "webp"].includes(metadata.format ?? "")) throw new TemplatePhotoError("Formato no admitido: subí un PNG, JPG o WebP.");
  const { width = 0, height = 0 } = await sharp(upright).metadata();
  if (Math.max(width, height) < MIN_TEMPLATE_PHOTO_PX) {
    throw new TemplatePhotoError(`La foto es muy chica: necesita al menos ${MIN_TEMPLATE_PHOTO_PX} px del lado mayor (recomendado 1080 px o más).`);
  }
  const { isOpaque } = await sharp(upright).stats();
  if (!isOpaque) {
    return sharp(upright)
      .resize(TEMPLATE_PX, TEMPLATE_PX, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
  }
  return cutOutWhiteBackground(upright);
}

const rgbaPng = (pixels: Buffer, width: number, height: number) =>
  sharp(pixels, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();

/**
 * Fabric: the design follows the folds of the photo. Offsets are the slope of
 * the blurred brightness (normalised to the photo's own folds), the shade is
 * its fine detail; `scale` is how far, in template pixels, the folds shift the print.
 */
export async function fabricWarp(template: Buffer | string, area: Box, scale: number): Promise<WarpMaps> {
  const { width, height } = area;
  const region = { left: area.left, top: area.top, width, height };
  const grey = (sigma: number) => sharp(template).greyscale().blur(sigma).extract(region).raw().toBuffer();
  const [fine, broad] = await Promise.all([grey(12), grey(45)]);
  const at = (buffer: Buffer, x: number, y: number) => buffer[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];

  const slopes = new Float32Array(width * height * 2);
  const detail = new Float32Array(width * height);
  const magnitudes: number[] = [];
  const details: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const gx = (at(fine, x + 2, y) - at(fine, x - 2, y)) / 4;
      const gy = (at(fine, x, y + 2) - at(fine, x, y - 2)) / 4;
      slopes[i * 2] = gx;
      slopes[i * 2 + 1] = gy;
      magnitudes.push(Math.abs(gx), Math.abs(gy));
      detail[i] = fine[i] - broad[i];
      details.push(Math.abs(detail[i]));
    }
  }
  const percentile = (values: number[], p: number) => values.sort((a, b) => a - b)[Math.floor(values.length * p)];
  // Normalise to the photo's own folds, but never blow up the noise of a flat, dark garment.
  const slopeRange = Math.max(percentile(magnitudes, 0.99), 1.5);
  const detailRange = Math.max(percentile(details, 0.99), 10);

  const map = Buffer.alloc(width * height * 4);
  const shade = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const k = i * 4;
    const sx = Math.max(-1, Math.min(1, slopes[i * 2] / slopeRange));
    const sy = Math.max(-1, Math.min(1, slopes[i * 2 + 1] / slopeRange));
    map[k] = Math.round(128 + 127 * sx);
    map[k + 1] = Math.round(128 + 127 * sy);
    map[k + 3] = 255;
    const g = Math.round(128 + 110 * Math.max(-1, Math.min(1, detail[i] / detailRange)));
    shade[k] = shade[k + 1] = shade[k + 2] = g;
    shade[k + 3] = 255;
  }
  return { map: await rgbaPng(map, width, height), shade: await rgbaPng(shade, width, height), scale };
}

/** Widest half-angle of the cylinder a mug photo's print area can span (curve 1). */
const MAX_HALF_ANGLE = (Math.PI / 2) * 0.95;

/**
 * Mug photo: the print area is the front of a cylinder seen straight on and
 * `curve` (0–1) how much of it the area spans (0 flat, 1 almost half the mug).
 * The design wraps around: wide in the middle, squeezed and darker toward the sides.
 */
export async function cylinderWarp(area: { width: number; height: number }, curve: number): Promise<WarpMaps> {
  const { width, height } = area;
  const alpha = Math.max(0.001, Math.min(1, curve) * MAX_HALF_ANGLE);
  // Offset from each output column to the column of the flat design it shows.
  const offsets = new Float64Array(width);
  const angles = new Float64Array(width);
  let largest = 0;
  for (let x = 0; x < width; x++) {
    const u = ((x + 0.5) / width) * 2 - 1;
    const theta = Math.asin(Math.max(-1, Math.min(1, u * Math.sin(alpha))));
    const source = ((theta / alpha + 1) / 2) * width - 0.5;
    offsets[x] = source - x;
    angles[x] = theta;
    largest = Math.max(largest, Math.abs(offsets[x]));
  }
  const scale = Math.max(2, Math.ceil(largest * 2 + 2));
  const map = Buffer.alloc(width * height * 4);
  const shade = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = (y * width + x) * 4;
      map[k] = Math.round(255 * (offsets[x] / scale + 0.5));
      map[k + 1] = 128;
      map[k + 3] = 255;
      const g = Math.round(128 - 60 * (1 - Math.cos(angles[x])));
      shade[k] = shade[k + 1] = shade[k + 2] = g;
      shade[k + 3] = 255;
    }
  }
  return { map: await rgbaPng(map, width, height), shade: await rgbaPng(shade, width, height), scale };
}
