import { randomBytes } from "node:crypto";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { isProductionEnv } from "../env.ts";

/**
 * Uploaded files live on the server's disk under MEDIA_ROOT (a Docker volume
 * on the VPS, included in the daily backup), in two areas that never mix:
 *
 *   public/   product and category photos, served by /media/*
 *   private/  custom request attachments, served only by routes that check access
 *
 * Off in production unless SUBLIME_MEDIA_IN_PRODUCTION=enabled, like the database.
 */
export type MediaArea = "public" | "private";

export function mediaRoot(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!env.MEDIA_ROOT) return null;
  if (isProductionEnv(env) && env.SUBLIME_MEDIA_IN_PRODUCTION !== "enabled") return null;
  return env.MEDIA_ROOT;
}

const SEGMENT = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const FILE = /^[a-z0-9][a-z0-9_-]{0,79}\.[a-z0-9]{2,5}$/i;

/** True for "folder/sub/name.ext" made only of safe segments: no "..", no absolute paths, no backslashes. */
export function isSafePathname(pathname: string): boolean {
  const parts = pathname.split("/");
  const file = parts.pop() ?? "";
  return parts.length > 0 && parts.length <= 4 && parts.every((part) => SEGMENT.test(part)) && FILE.test(file);
}

/** Absolute path of a stored file, or null when the pathname is unsafe or storage is off. */
export function resolveMediaPath(area: MediaArea, pathname: string, root = mediaRoot()): string | null {
  if (!root || !isSafePathname(pathname)) return null;
  // Runtime-only location: keeps the build from tracing the project into the bundle.
  const base = resolve(/* turbopackIgnore: true */ root, area);
  const full = resolve(base, ...pathname.split("/"));
  return full.startsWith(base + sep) ? full : null;
}

/** Writes bytes as `<folder>/<name>-<random>.<ext>` and returns that pathname. */
export async function saveMediaFile(area: MediaArea, folder: string, name: string, extension: string, bytes: Uint8Array): Promise<string> {
  const pathname = `${folder}/${name}-${randomBytes(12).toString("hex")}.${extension}`;
  const full = resolveMediaPath(area, pathname);
  if (!full) throw new Error("Media storage is not configured or the path is invalid");
  await mkdir(dirname(full), { recursive: true });
  // "wx": never overwrite an existing file.
  await writeFile(full, bytes, { flag: "wx" });
  return pathname;
}

/** Size of a stored file, or null when it does not exist. */
export async function statMediaFile(area: MediaArea, pathname: string): Promise<{ path: string; size: number } | null> {
  const full = resolveMediaPath(area, pathname);
  if (!full) return null;
  try {
    const info = await stat(/* turbopackIgnore: true */ full);
    return info.isFile() ? { path: full, size: info.size } : null;
  } catch {
    return null;
  }
}

/** Best effort: the database row is already gone, a leftover file is only storage. */
export async function deleteMediaFile(area: MediaArea, pathname: string): Promise<void> {
  const full = resolveMediaPath(area, pathname);
  if (!full) return;
  try {
    await rm(full, { force: true });
  } catch (error) {
    console.warn("[media] could not delete file", { area, error: (error as Error).message });
  }
}
