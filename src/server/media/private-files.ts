import { del, get, put } from "@vercel/blob";
import { ImageFileError, sniffImage } from "./image-file.ts";

/**
 * Private files (custom request references: logos, sketches). They live in a
 * PRIVATE Blob store, separate from the public product photos, and are only
 * served through routes that check who is asking.
 *
 * The store is connected to the project with the "PRIVATE_BLOB" prefix, which
 * exposes PRIVATE_BLOB_STORE_ID (OIDC) or PRIVATE_BLOB_READ_WRITE_TOKEN. Off in
 * Vercel production unless SUBLIME_BLOB_IN_PRODUCTION=enabled.
 */
type Credentials = { storeId: string } | { token: string };

export function privateStorage(env: NodeJS.ProcessEnv = process.env): Credentials | null {
  const credentials: Credentials | null = env.PRIVATE_BLOB_STORE_ID
    ? { storeId: env.PRIVATE_BLOB_STORE_ID }
    : env.PRIVATE_BLOB_READ_WRITE_TOKEN
      ? { token: env.PRIVATE_BLOB_READ_WRITE_TOKEN }
      : null;
  if (!credentials) return null;
  if (env.VERCEL_ENV === "production" && env.SUBLIME_BLOB_IN_PRODUCTION !== "enabled") return null;
  return credentials;
}

export const hasPrivateStorage = () => privateStorage() !== null;

/** Vercel Functions accept request bodies up to 4.5 MB; the rest of the form needs room too. */
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
  const credentials = privateStorage();
  if (!credentials) throw new Error("Private storage is not configured");
  const blob = await put(`${folder}/archivo.${info.extension}`, Buffer.from(bytes), {
    access: "private",
    contentType: info.type,
    addRandomSuffix: true,
    ...credentials,
  });
  return blob.pathname;
}

export async function readPrivateFile(pathname: string) {
  const credentials = privateStorage();
  if (!credentials) return null;
  const result = await get(pathname, { access: "private", ...credentials });
  return result?.statusCode === 200 ? result : null;
}

/** Best effort: used to clean up when saving the request fails. */
export async function deletePrivateFile(pathname: string): Promise<void> {
  const credentials = privateStorage();
  if (!credentials) return;
  try {
    await del(pathname, credentials);
  } catch (error) {
    console.warn("[blob] could not delete private file", { error: (error as Error).message });
  }
}
