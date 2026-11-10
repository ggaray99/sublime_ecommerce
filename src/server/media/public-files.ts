import { deleteMediaFile, mediaRoot, saveMediaFile } from "./disk.ts";
import type { ImageInfo } from "./image-file.ts";

/** Product and category photos, stored on disk and served by /media/*. */
export function hasMediaStorage(env: NodeJS.ProcessEnv = process.env): boolean {
  return mediaRoot(env) !== null;
}

const PREFIX = "/media/";

/** Only photos uploaded here are ever deleted from storage (never demo files or old remote URLs). */
export const isStoredImageUrl = (url: string) => url.startsWith(PREFIX) && !url.includes("..");

/** Stores a validated image under `<folder>/imagen-<random>.<ext>` and returns its URL. */
export async function storeImage(folder: string, bytes: Uint8Array, info: ImageInfo) {
  const pathname = await saveMediaFile("public", folder, "imagen", info.extension, bytes);
  return { url: `${PREFIX}${pathname}`, pathname };
}

/** Best effort: the database row is already gone, a leftover file is only storage. */
export async function deleteStoredImage(url: string): Promise<void> {
  if (!isStoredImageUrl(url)) return;
  await deleteMediaFile("public", url.slice(PREFIX.length));
}
