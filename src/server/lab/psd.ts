import { writePsdBuffer, type Layer } from "ag-psd";
import sharp from "sharp";
import { PRINT_DPI, SHEET, type Placement } from "../../lib/lab/sheets.ts";
import type { PreparedSticker } from "./sticker.ts";

/**
 * Plotter file: one PSD per sheet (21 × 29 cm at 300 dpi) with separate layers so
 * the operator can show or hide each part:
 *   Stickers/        one layer per sticker (artwork + white contour)
 *   Línea de corte/  the die-cut outline of each sticker, in magenta
 *   Guías            the four corner registration crosses
 */

const mmToPx = (mm: number) => Math.round((mm / 25.4) * PRINT_DPI);
const CUT = { r: 255, g: 0, b: 255 };
const CUT_WIDTH_PX = 3;

type Pixels = { width: number; height: number; data: Uint8ClampedArray };

async function rgba(png: Buffer, rotated: boolean): Promise<Pixels> {
  const { data, info } = await sharp(png).rotate(rotated ? 90 : 0).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

/** Outline of the cut mask: mask pixels with a non-mask pixel within CUT_WIDTH_PX. */
async function cutOutline(mask: Buffer, rotated: boolean): Promise<Pixels> {
  const { data, info } = await sharp(mask).rotate(rotated ? 90 : 0).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && data[(y * width + x) * info.channels] > 127;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!inside(x, y)) continue;
      let edge = false;
      for (let d = 1; d <= CUT_WIDTH_PX && !edge; d++) {
        edge = !inside(x - d, y) || !inside(x + d, y) || !inside(x, y - d) || !inside(x, y + d);
      }
      if (!edge) continue;
      const p = (y * width + x) * 4;
      out[p] = CUT.r;
      out[p + 1] = CUT.g;
      out[p + 2] = CUT.b;
      out[p + 3] = 255;
    }
  }
  return { width, height, data: out };
}

function cross(size: number): Pixels {
  const data = new Uint8ClampedArray(size * size * 4);
  const mid = Math.floor(size / 2);
  for (let i = 0; i < size; i++) {
    for (let t = -1; t <= 1; t++) {
      for (const [x, y] of [
        [i, mid + t],
        [mid + t, i],
      ]) {
        const p = (y * size + x) * 4;
        data[p + 3] = 255; // black
      }
    }
  }
  return { width: size, height: size, data };
}

export async function renderSheetPsd(placements: Placement[], stickers: Map<string, PreparedSticker>, composite: Buffer): Promise<Buffer> {
  const width = mmToPx(SHEET.widthMm);
  const height = mmToPx(SHEET.heightMm);
  const art: Layer[] = [];
  const cuts: Layer[] = [];

  for (const [index, placement] of placements.entries()) {
    const sticker = stickers.get(placement.id);
    if (!sticker) continue;
    const left = mmToPx(placement.xMm);
    const top = mmToPx(placement.yMm);
    const label = `${index + 1} · ${placement.id}`;
    art.push({ name: `Sticker ${label}`, left, top, imageData: await rgba(sticker.withContour, placement.rotated) });
    cuts.push({ name: `Corte ${label}`, left, top, imageData: await cutOutline(sticker.cutMask, placement.rotated) });
  }

  const markSize = mmToPx(8);
  const c = mmToPx(SHEET.cornerMm) / 2;
  const guides: Layer[] = [
    [c, c],
    [width - c, c],
    [c, height - c],
    [width - c, height - c],
  ].map(([x, y], i) => ({ name: `Guía ${i + 1}`, left: Math.round(x - markSize / 2), top: Math.round(y - markSize / 2), imageData: cross(markSize) }));

  const flat = await sharp(composite).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return writePsdBuffer(
    {
      width,
      height,
      // Composite preview for viewers that do not read layers.
      imageData: { width: flat.info.width, height: flat.info.height, data: new Uint8ClampedArray(flat.data.buffer, flat.data.byteOffset, flat.data.length) },
      imageResources: { resolutionInfo: { horizontalResolution: PRINT_DPI, horizontalResolutionUnit: "PPI", widthUnit: "Centimeters", verticalResolution: PRINT_DPI, verticalResolutionUnit: "PPI", heightUnit: "Centimeters" } },
      children: [
        { name: "Stickers", opened: true, children: art },
        { name: "Línea de corte", opened: true, children: cuts },
        { name: "Guías", children: guides },
      ],
    },
    { generateThumbnail: false },
  );
}
