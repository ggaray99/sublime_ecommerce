import sharp, { type Metadata } from "sharp";
import { pruneMediaFolder, readMediaFile, saveMediaFile } from "../media/disk.ts";
import { MAX_INPUT_PIXELS, MAX_UPLOAD_BYTES, StickerError } from "./sticker.ts";

/**
 * Temporary Custom Lab uploads. The editor uploads each image once and then asks
 * for previews by id; the final order copies what it uses into the request's own
 * folder. They live in the private area (never public) and expire after a day.
 */
const FOLDER = "lab-tmp";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const UPLOAD_ID = /^lab-tmp\/original-[0-9a-f]{24}\.(png|jpg|webp)$/;

export const isUploadId = (value: unknown): value is string => typeof value === "string" && UPLOAD_ID.test(value);

const EXTENSION: Record<string, string> = { png: "png", jpeg: "jpg", webp: "webp" };

export type LabUpload = { uploadId: string; widthPx: number; heightPx: number; format: string };

export async function storeLabUpload(bytes: Uint8Array): Promise<LabUpload> {
  if (!bytes.length) throw new StickerError("El archivo está vacío.");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new StickerError("La imagen supera los 15 MB.");
  let meta: Metadata;
  try {
    meta = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new StickerError("No pudimos leer la imagen: subí un PNG, JPG o WebP de hasta 40 megapíxeles.");
  }
  const extension = meta.format ? EXTENSION[meta.format] : undefined;
  if (!extension || !meta.width || !meta.height) throw new StickerError("Formato no admitido: subí un PNG, JPG o WebP.");
  await pruneMediaFolder("private", FOLDER, MAX_AGE_MS);
  const uploadId = await saveMediaFile("private", FOLDER, "original", extension, bytes);
  return { uploadId, widthPx: meta.width, heightPx: meta.height, format: extension };
}

export async function readLabUpload(uploadId: string): Promise<Buffer | null> {
  return isUploadId(uploadId) ? readMediaFile("private", uploadId) : null;
}
