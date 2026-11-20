import { initializeCanvas, readPsd } from "ag-psd";
import sharp, { type Sharp } from "sharp";
import { DESIGN_MAX_BYTES, type DesignFileCheck } from "../../lib/designs/upload.ts";
import { deleteMediaFile, saveMediaFile } from "../media/disk.ts";

// ag-psd allocates pixel buffers through a canvas even with `useImageData`. On the
// server plain byte arrays are enough, so no native canvas package is needed.
initializeCanvas(
  () => {
    throw new Error("Canvas is not available on the server.");
  },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: "srgb" }) as ImageData,
);

/**
 * Design uploads. The admin sends a PNG (recommended: transparent background), a
 * JPG/WebP or a Photoshop PSD; the server keeps a full-resolution PNG for
 * production in the private area and a light WebP preview for the store's mockups.
 * SVG and PDF are refused: SVG can carry scripts and PDF needs a rasterizer.
 */
export const MAX_DESIGN_BYTES = DESIGN_MAX_BYTES;
export const MIN_DESIGN_PX = 500;
export const MAX_DESIGN_PX = 8000;
export const PREVIEW_MAX_PX = 1200;
const MAX_INPUT_PIXELS = 40_000_000;

export class DesignFileError extends Error {}

export type DesignFormat = "png" | "jpg" | "webp" | "psd";

export type PreparedDesign = {
  source: Buffer;
  preview: Buffer;
  width: number;
  height: number;
  opaque: boolean;
  format: DesignFormat;
  /** Something the admin should know before publishing (e.g. no transparency). */
  warning: string | null;
};

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((byte, i) => bytes[offset + i] === byte);

function sniff(bytes: Uint8Array): DesignFormat | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  if (startsWith(bytes, [0x38, 0x42, 0x50, 0x53])) return "psd";
  return null;
}

/** Photoshop's flattened image; files saved without "Maximize compatibility" have a blank one. */
async function flattenPsd(bytes: Uint8Array): Promise<Sharp> {
  let document;
  try {
    document = readPsd(bytes, { skipLayerImageData: true, skipThumbnail: true, skipLinkedFilesData: true, useImageData: true, totalMemoryLimit: 512 * 1024 * 1024 });
  } catch {
    throw new DesignFileError("No pudimos leer el PSD. Exportalo como PNG desde Photoshop (Archivo → Exportar → PNG).");
  }
  const { width, height } = document;
  if (width > MAX_DESIGN_PX || height > MAX_DESIGN_PX) throw new DesignFileError(`El diseño puede medir hasta ${MAX_DESIGN_PX} px por lado.`);
  const composite = document.imageData;
  const blank = !composite || composite.data.every((value, i) => value === composite.data[i % 4]);
  if (blank) {
    throw new DesignFileError("El PSD no trae la imagen combinada: guardalo con \"Maximizar compatibilidad\" o exportalo como PNG.");
  }
  return sharp(Buffer.from(composite.data.buffer, composite.data.byteOffset, composite.data.byteLength), { raw: { width, height, channels: 4 } });
}

/** Validates and converts an upload. Throws DesignFileError with a message for the admin. */
export async function prepareDesignFile(bytes: Uint8Array): Promise<PreparedDesign> {
  if (!bytes.length) throw new DesignFileError("El archivo está vacío.");
  if (bytes.length > MAX_DESIGN_BYTES) throw new DesignFileError("El archivo supera los 15 MB.");
  const format = sniff(bytes);
  if (!format) throw new DesignFileError("Formato no admitido: subí un PNG, JPG, WebP o PSD.");

  let image: Sharp;
  let width: number;
  let height: number;
  if (format === "psd") {
    image = await flattenPsd(bytes);
  } else {
    image = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS });
  }
  try {
    // Rotate by EXIF so phone photos are not stored sideways.
    const source = await image.rotate().png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    ({ width, height } = source.info);
    if (Math.min(width, height) < MIN_DESIGN_PX) {
      throw new DesignFileError(`La imagen es muy chica: necesita al menos ${MIN_DESIGN_PX} px por lado (recomendado 3000 px o más).`);
    }
    if (Math.max(width, height) > MAX_DESIGN_PX) throw new DesignFileError(`El diseño puede medir hasta ${MAX_DESIGN_PX} px por lado.`);
    const [stats, preview] = await Promise.all([
      sharp(source.data).stats(),
      sharp(source.data).resize(PREVIEW_MAX_PX, PREVIEW_MAX_PX, { fit: "inside", withoutEnlargement: true }).webp({ quality: 88, alphaQuality: 100 }).toBuffer(),
    ]);
    const opaque = stats.isOpaque;
    const warning = opaque
      ? "La imagen no tiene fondo transparente: se va a imprimir con su fondo. Para remeras de color conviene un PNG transparente."
      : null;
    return { source: source.data, preview, width, height, opaque, format, warning };
  } catch (error) {
    if (error instanceof DesignFileError) throw error;
    throw new DesignFileError("No pudimos leer la imagen: subí un PNG, JPG, WebP o PSD de hasta 40 megapíxeles.");
  }
}

/** The admin's check right after picking a file: the same validation as saving, without storing anything. */
export async function checkDesignFile(bytes: Uint8Array): Promise<DesignFileCheck> {
  try {
    const { width, height, warning } = await prepareDesignFile(bytes);
    return { ok: true, width, height, warning };
  } catch (error) {
    if (error instanceof DesignFileError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Writes both files; the preview is public (served by /media), the source stays private. */
export async function storeDesignFiles(slug: string, design: PreparedDesign): Promise<{ imageUrl: string; sourcePath: string }> {
  const name = slug.slice(0, 40).replace(/-+$/, "") || "diseno";
  const sourcePath = await saveMediaFile("private", "disenos", name, "png", design.source);
  try {
    const previewPath = await saveMediaFile("public", "disenos", name, "webp", design.preview);
    return { imageUrl: `/media/${previewPath}`, sourcePath };
  } catch (error) {
    await deleteMediaFile("private", sourcePath).catch(() => {});
    throw error;
  }
}

/** Best effort: the row no longer points at them. */
export async function deleteDesignFiles(files: { imageUrl: string; sourcePath: string }): Promise<void> {
  const tasks = [];
  if (files.imageUrl.startsWith("/media/disenos/")) tasks.push(deleteMediaFile("public", files.imageUrl.slice("/media/".length)));
  if (files.sourcePath.startsWith("disenos/")) tasks.push(deleteMediaFile("private", files.sourcePath));
  await Promise.allSettled(tasks);
}

/** Full-resolution file for production, for the admin only. */
export { readMediaFile as readDesignSourceFile } from "../media/disk.ts";
