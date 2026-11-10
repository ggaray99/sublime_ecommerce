import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { deleteMediaFile, mediaRoot, saveMediaFile, statMediaFile } from "./disk.ts";
import { ImageFileError, sniffImage } from "./image-file.ts";

/**
 * Private files (custom request references: logos, sketches). They live in the
 * private area of the media disk, separate from the public photos, and are only
 * served through routes that check who is asking. Never under /media/*.
 */
export const hasPrivateStorage = (env: NodeJS.ProcessEnv = process.env) => mediaRoot(env) !== null;

/** Uploads go through Server Actions; the rest of the form needs room within the body limit. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

export type AttachmentInfo = { type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; extension: string; size: number };

/** Type from the file's own bytes: JPEG, PNG, WebP or PDF. Never trusts the name or the browser. */
export function inspectAttachment(bytes: Uint8Array): AttachmentInfo {
  if (!bytes.length) throw new ImageFileError("El archivo está vacío.");
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new ImageFileError("El archivo supera 4 MB.");
  const image = sniffImage(bytes);
  if (image) return { type: image.type, extension: image.extension, size: bytes.length };
  if (String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-") return { type: "application/pdf", extension: "pdf", size: bytes.length };
  throw new ImageFileError("Formato no admitido: subí un PNG, JPG, WebP o PDF.");
}

/** Stores the file with a random name; returns the private pathname (never a public URL). */
export async function storePrivateFile(folder: string, bytes: Uint8Array, info: AttachmentInfo): Promise<string> {
  return saveMediaFile("private", folder, "archivo", info.extension, bytes);
}

export async function readPrivateFile(pathname: string): Promise<{ stream: ReadableStream; size: number } | null> {
  const file = await statMediaFile("private", pathname);
  if (!file) return null;
  return { stream: Readable.toWeb(createReadStream(file.path)) as ReadableStream, size: file.size };
}

/** Best effort: used to clean up when saving the request fails. */
export async function deletePrivateFile(pathname: string): Promise<void> {
  await deleteMediaFile("private", pathname);
}
