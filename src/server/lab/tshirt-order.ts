import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp, { type OutputInfo } from "sharp";
import {
  CATALOG_DESIGNS,
  catalogDesignSrc,
  clampPlacement,
  PRINT_AREA_CM,
  printArea,
  printWidthCm,
  SHIRT_COLORS,
  SHIRT_SIDES,
  SHIRT_SIZES,
  shirtTemplateSrc,
  type Placement,
  type ShirtColor,
  type ShirtSide,
} from "../../lib/lab/tshirt.ts";
import { PRINT_DPI } from "../../lib/lab/sheets.ts";
import { MAX_INPUT_PIXELS, MIN_DPI, StickerError } from "./sticker.ts";
import { isUploadId, readLabUpload } from "./uploads.ts";
import type { BuiltFile } from "./sticker-order.ts";

export type TshirtOrder = {
  color: ShirtColor;
  side: ShirtSide;
  design: { source: "catalog"; id: string } | { source: "upload"; uploadId: string; name: string };
  placement: Placement;
  sizes: { size: (typeof SHIRT_SIZES)[number]; quantity: number }[];
};

export const TSHIRT_LIMITS = { perSize: 200, total: 500 } as const;

/** Validates what the editor sends; nothing from the browser is trusted. */
export function parseTshirtOrder(raw: string): { ok: true; value: TshirtOrder } | { ok: false; error: string } {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Elegí un diseño para la remera." };
  }
  const color = data.color as ShirtColor;
  const side = data.side as ShirtSide;
  if (!(color in SHIRT_COLORS)) return { ok: false, error: "Elegí el color de la remera." };
  if (!(side in SHIRT_SIDES)) return { ok: false, error: "Elegí dónde va el estampado." };

  const design = data.design as Record<string, unknown> | undefined;
  let parsedDesign: TshirtOrder["design"];
  if (design?.source === "catalog" && CATALOG_DESIGNS.some((d) => d.id === design.id)) {
    parsedDesign = { source: "catalog", id: design.id as string };
  } else if (design?.source === "upload" && isUploadId(design.uploadId)) {
    const name = typeof design.name === "string" ? design.name.replace(/[^\p{L}\p{N} ._()-]/gu, "").slice(0, 80) || "diseño" : "diseño";
    parsedDesign = { source: "upload", uploadId: design.uploadId as string, name };
  } else {
    return { ok: false, error: "Elegí un diseño de la lista o subí el tuyo." };
  }

  const placement = data.placement as Record<string, unknown> | undefined;
  const p = { scale: Number(placement?.scale), x: Number(placement?.x), y: Number(placement?.y) };
  if (![p.scale, p.x, p.y].every((n) => Number.isFinite(n))) return { ok: false, error: "Ubicá el diseño en la remera." };

  const sizes: TshirtOrder["sizes"] = [];
  for (const line of Array.isArray(data.sizes) ? (data.sizes as Record<string, unknown>[]) : []) {
    const quantity = Number(line?.quantity);
    if (!quantity) continue;
    if (!SHIRT_SIZES.includes(line.size as (typeof SHIRT_SIZES)[number])) return { ok: false, error: "Talle inválido." };
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > TSHIRT_LIMITS.perSize) {
      return { ok: false, error: `La cantidad por talle va de 0 a ${TSHIRT_LIMITS.perSize}.` };
    }
    sizes.push({ size: line.size as (typeof SHIRT_SIZES)[number], quantity });
  }
  const total = sizes.reduce((sum, s) => sum + s.quantity, 0);
  if (!total) return { ok: false, error: "Indicá al menos una remera en algún talle." };
  if (total > TSHIRT_LIMITS.total) return { ok: false, error: `Para más de ${TSHIRT_LIMITS.total} remeras escribinos.` };

  return { ok: true, value: { color, side, design: parsedDesign, placement: p, sizes } };
}

const publicFile = (src: string) => readFile(/* turbopackIgnore: true */ join(process.cwd(), "public", ...src.split("/").filter(Boolean)));

/**
 * Builds the T-shirt files on the server: the mockup preview (template + design
 * where the customer put it) and the production print, a transparent PNG at
 * 300 dpi over the 28 × 35 cm print area.
 */
export async function buildTshirtOrder(order: TshirtOrder) {
  const designBytes =
    order.design.source === "catalog" ? await publicFile(catalogDesignSrc(order.design.id, order.color)) : await readLabUpload(order.design.uploadId);
  if (!designBytes) throw new StickerError("Volvé a subir tu diseño: la imagen ya no está disponible.");

  let design: { data: Buffer; info: OutputInfo };
  try {
    design = await sharp(designBytes, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().ensureAlpha().trim({ threshold: 0 }).png().toBuffer({ resolveWithObject: true });
  } catch {
    throw new StickerError("No pudimos leer tu diseño: subí un PNG, JPG o WebP.");
  }
  const aspect = design.info.width / design.info.height;
  const placement = clampPlacement(order.placement, aspect);
  const widthCm = printWidthCm(placement);
  const dpi = Math.round(design.info.width / (widthCm / 2.54));
  if (order.design.source === "upload" && dpi < MIN_DPI) {
    throw new StickerError(`Tu diseño tiene poca resolución para ${widthCm} cm de ancho (${dpi} dpi). Achicalo o subí una imagen más grande.`);
  }

  // Production: the print area at 300 dpi, design placed as shown.
  const areaW = Math.round((PRINT_AREA_CM.width / 2.54) * PRINT_DPI);
  const areaH = Math.round((PRINT_AREA_CM.height / 2.54) * PRINT_DPI);
  const printW = Math.round(placement.scale * areaW);
  const printH = Math.round(printW / aspect);
  const printPng = await sharp(design.data).resize({ width: printW, height: printH, fit: "fill" }).png().toBuffer();
  const production = await sharp({ create: { width: areaW, height: areaH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: printPng, left: Math.round(placement.x * areaW - printW / 2), top: Math.round(placement.y * areaH - printH / 2) }])
    .png()
    .withMetadata({ density: PRINT_DPI })
    .toBuffer();

  // Preview: the same placement on the template photo.
  const area = printArea(order.color, order.side);
  const previewW = Math.max(1, Math.round(placement.scale * area.width));
  const previewH = Math.max(1, Math.round(previewW / aspect));
  const preview = await sharp(await publicFile(shirtTemplateSrc(order.color, order.side)))
    .composite([
      {
        input: await sharp(design.data).resize({ width: previewW, height: previewH, fit: "fill" }).png().toBuffer(),
        left: Math.round(area.left + placement.x * area.width - previewW / 2),
        top: Math.round(area.top + placement.y * area.height - previewH / 2),
        blend: order.color === "white" ? "multiply" : "over",
      },
    ])
    .png()
    .toBuffer();

  const total = order.sizes.reduce((sum, s) => sum + s.quantity, 0);
  const designName = order.design.source === "catalog" ? CATALOG_DESIGNS.find((d) => d.id === (order.design as { id: string }).id)!.name : order.design.name;
  const files: BuiltFile[] = [];
  if (order.design.source === "upload") {
    const extension = order.design.uploadId.split(".").pop() ?? "png";
    files.push({ bytes: designBytes, name: `original-${designName}.${extension}`, extension, contentType: extension === "jpg" ? "image/jpeg" : `image/${extension}`, role: "original" });
  }
  files.push({ bytes: preview, name: `remera-${order.color}-${order.side}.png`, extension: "png", contentType: "image/png", role: "preview", width: 1080, height: 1080 });
  files.push({ bytes: production, name: `estampa-${order.side}-${widthCm}cm.png`, extension: "png", contentType: "image/png", role: "production", width: areaW, height: areaH });

  const config = {
    v: 1,
    color: order.color,
    side: order.side,
    design: order.design.source === "catalog" ? { source: "catalog", id: order.design.id, name: designName } : { source: "upload", name: designName },
    placement,
    printWidthCm: widthCm,
    dpi,
    sizes: order.sizes,
  };
  const summary = `Remeras ${SHIRT_COLORS[order.color].toLowerCase()}s con estampa "${designName}" en ${SHIRT_SIDES[order.side].toLowerCase()} (${widthCm} cm de ancho): ${order.sizes.map((s) => `${s.size} × ${s.quantity}`).join(", ")}. Total: ${total}.`;
  return { files, config, total, summary };
}
