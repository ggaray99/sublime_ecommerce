import { del, put } from "@vercel/blob";
import type { ImageInfo } from "./image-file.ts";

/**
 * Image storage (Vercel Blob, public store). Like the database, it is off in
 * Vercel production unless SUBLIME_BLOB_IN_PRODUCTION=enabled, so a staging
 * store connected by mistake is never written from the public site.
 *
 * Credentials: stores connected to the project expose BLOB_STORE_ID and the SDK
 * authenticates with the function's short-lived OIDC token; BLOB_READ_WRITE_TOKEN
 * (classic token) also works, e.g. for local runs.
 */
export function hasBlobStorage(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.BLOB_STORE_ID && !env.BLOB_READ_WRITE_TOKEN) return false;
  if (env.VERCEL_ENV === "production") return env.SUBLIME_BLOB_IN_PRODUCTION === "enabled";
  return true;
}

/** Hosts of public Blob stores; only these URLs are ever deleted from storage. */
export const isBlobUrl = (url: string) => {
  try {
    return new URL(url).hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
};

/** Stores a validated image under `<folder>/<name>-<random>.<ext>` and returns its public URL. */
export async function storeImage(folder: string, bytes: Uint8Array, info: ImageInfo) {
  const blob = await put(`${folder}/imagen.${info.extension}`, Buffer.from(bytes), {
    access: "public",
    contentType: info.type,
    addRandomSuffix: true,
    // Uploaded files never change: a new upload gets a new URL.
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return { url: blob.url, pathname: blob.pathname };
}

/** Best effort: the database row is already gone, a leftover file is only storage. */
export async function deleteStoredImage(url: string): Promise<void> {
  if (!isBlobUrl(url)) return;
  try {
    await del(url);
  } catch (error) {
    console.warn("[blob] could not delete image", { url, error: (error as Error).message });
  }
}
