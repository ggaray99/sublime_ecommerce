import { packSheets, PRINT_DPI, STICKER_SIZE_CM } from "../../lib/lab/sheets.ts";
import { renderSheetPsd } from "./psd.ts";
import { prepareSticker, renderSheetPng, StickerError, type PreparedSticker } from "./sticker.ts";
import { isUploadId, readLabUpload } from "./uploads.ts";

/** One design of a sticker order, as the editor sends it (validated here, never trusted). */
export type StickerDesign = {
  uploadId: string;
  name: string;
  sizeCm: number;
  quantity: number;
  removeBackground: boolean;
  tolerance: number;
};

export const STICKER_LIMITS = { designs: 8, quantityPerDesign: 500, sheets: 20 } as const;
export const TOLERANCE = { min: 8, max: 80, default: 32 } as const;

const pxToMm = (px: number) => (px / PRINT_DPI) * 25.4;

export function parseStickerDesigns(raw: string): { ok: true; value: StickerDesign[] } | { ok: false; error: string } {
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Subí al menos un diseño." };
  }
  if (!Array.isArray(list) || list.length === 0) return { ok: false, error: "Subí al menos un diseño." };
  if (list.length > STICKER_LIMITS.designs) return { ok: false, error: `Podés pedir hasta ${STICKER_LIMITS.designs} diseños por encargo.` };
  const designs: StickerDesign[] = [];
  for (const item of list as Record<string, unknown>[]) {
    const sizeCm = Number(item?.sizeCm);
    const quantity = Number(item?.quantity);
    const tolerance = Number(item?.tolerance ?? TOLERANCE.default);
    if (!isUploadId(item?.uploadId)) return { ok: false, error: "Volvé a subir los diseños: alguno ya no está disponible." };
    if (!(sizeCm >= STICKER_SIZE_CM.min && sizeCm <= STICKER_SIZE_CM.max) || Math.round(sizeCm * 2) !== sizeCm * 2) {
      return { ok: false, error: `El tamaño va de ${STICKER_SIZE_CM.min} a ${STICKER_SIZE_CM.max} cm, de medio en medio.` };
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > STICKER_LIMITS.quantityPerDesign) {
      return { ok: false, error: `La cantidad de cada diseño va de 1 a ${STICKER_LIMITS.quantityPerDesign}.` };
    }
    if (!Number.isInteger(tolerance) || tolerance < TOLERANCE.min || tolerance > TOLERANCE.max) return { ok: false, error: "Tolerancia inválida." };
    const name = typeof item.name === "string" ? item.name.replace(/[^\p{L}\p{N} ._()-]/gu, "").slice(0, 80) || "diseño" : "diseño";
    designs.push({ uploadId: item.uploadId as string, name, sizeCm, quantity, removeBackground: item.removeBackground === true, tolerance });
  }
  return { ok: true, value: designs };
}

export type BuiltFile = { bytes: Uint8Array; name: string; extension: string; contentType: string; role: "original" | "preview" | "production"; width?: number; height?: number };

/**
 * Rebuilds every design from its original on the server, lays out the sheets and
 * renders the files: originals, design previews, sheet previews (PNG) and the
 * plotter PSD of each sheet.
 */
export async function buildStickerOrder(designs: StickerDesign[]) {
  const prepared = new Map<string, PreparedSticker>();
  const files: BuiltFile[] = [];
  const configDesigns = [];

  for (const [index, design] of designs.entries()) {
    const bytes = await readLabUpload(design.uploadId);
    if (!bytes) throw new StickerError(`Volvé a subir "${design.name}": la imagen ya no está disponible.`);
    const sticker = await prepareSticker(bytes, design);
    const id = `d${index + 1}`;
    prepared.set(id, sticker);
    const extension = design.uploadId.split(".").pop() ?? "png";
    files.push({ bytes, name: `original-${index + 1}-${design.name}.${extension}`, extension, contentType: extension === "jpg" ? "image/jpeg" : `image/${extension}`, role: "original" });
    files.push({ bytes: sticker.withContour, name: `sticker-${index + 1}.png`, extension: "png", contentType: "image/png", role: "preview", width: sticker.widthPx, height: sticker.heightPx });
    configDesigns.push({
      id,
      name: design.name,
      sizeCm: design.sizeCm,
      quantity: design.quantity,
      removeBackground: sticker.backgroundRemoved,
      tolerance: design.tolerance,
      dpi: Math.round(sticker.dpi),
      widthMm: Math.round(pxToMm(sticker.widthPx) * 10) / 10,
      heightMm: Math.round(pxToMm(sticker.heightPx) * 10) / 10,
    });
  }

  const layout = packSheets(
    configDesigns.map((d) => ({ id: d.id, widthMm: pxToMm(prepared.get(d.id)!.widthPx), heightMm: pxToMm(prepared.get(d.id)!.heightPx), quantity: d.quantity })),
  );
  if (layout.unplaced.length) throw new StickerError("Algún diseño no entra en la plancha: probá con un tamaño menor.");
  if (layout.sheets.length > STICKER_LIMITS.sheets) {
    throw new StickerError(`El pedido ocupa ${layout.sheets.length} planchas: para más de ${STICKER_LIMITS.sheets} escribinos y lo armamos con vos.`);
  }

  for (const [index, sheet] of layout.sheets.entries()) {
    const png = await renderSheetPng(sheet, prepared);
    files.push({ bytes: png, name: `plancha-${index + 1}.png`, extension: "png", contentType: "image/png", role: "preview", width: 2480, height: 3425 });
    files.push({ bytes: await renderSheetPsd(sheet, prepared, png), name: `plancha-${index + 1}.psd`, extension: "psd", contentType: "image/vnd.adobe.photoshop", role: "production", width: 2480, height: 3425 });
  }

  const total = designs.reduce((sum, d) => sum + d.quantity, 0);
  const config = { v: 1, designs: configDesigns, sheets: layout.sheets.length, perSheet: layout.sheets.map((s) => s.length), layout: layout.sheets };
  const summary = `Stickers troquelados: ${designs.length} ${designs.length === 1 ? "diseño" : "diseños"}, ${total} unidades en ${layout.sheets.length} ${layout.sheets.length === 1 ? "plancha" : "planchas"} (${designs.map((d) => `${d.name} ${d.sizeCm} cm × ${d.quantity}`).join("; ")}).`;
  return { files, config, total, summary, sheets: layout.sheets.length };
}
