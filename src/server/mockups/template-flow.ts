import {
  DEFAULT_MUG_CURVE,
  FABRIC_WARP_PX,
  fitTemplateArea,
  slotKey,
  startingArea,
  type Box,
  type TemplateSlot,
} from "../../lib/designs/mockups.ts";
import { AdminDataError, type Admin } from "../admin/repository.ts";
import { assertTemplateSlot, templateFiles, type MockupTemplateRepository, type StoredTemplate } from "./templates-repository.ts";
import { cylinderWarp, fabricWarp, prepareTemplatePhoto } from "./warp.ts";

/** What the Soportes actions pass in: the repository and the public media disk. */
export type TemplateFlowDeps = {
  repo: Pick<MockupTemplateRepository, "getTemplate" | "saveTemplate" | "deleteTemplate">;
  /** Stores a PNG under /media/soportes and returns its URL. */
  save: (name: string, png: Buffer) => Promise<string>;
  /** Bytes of a stored file, or null when it is gone. */
  read: (url: string) => Promise<Buffer | null>;
  /** Best effort: deletes stored files no template points at any more. */
  remove: (urls: string[]) => Promise<void>;
};

type Warp = StoredTemplate["warp"];

/** Garments follow the photo's folds, a mug wraps around its curve, a sticker stays flat. */
async function buildWarp(deps: TemplateFlowDeps, slot: TemplateSlot, image: Buffer, area: Box, curve: number | null): Promise<Warp> {
  if (slot.kind === "sticker") return null;
  const maps = slot.kind === "mug" ? await cylinderWarp(area, curve ?? DEFAULT_MUG_CURVE) : await fabricWarp(image, area, FABRIC_WARP_PX);
  const name = slotKey(slot);
  const map = await deps.save(`${name}-map`, maps.map);
  try {
    return { map, shade: await deps.save(`${name}-shade`, maps.shade), scale: maps.scale };
  } catch (error) {
    await deps.remove([map]);
    throw error;
  }
}

/** Saves the slot's template; on failure the files just written are deleted, on success the ones it replaced. */
async function saveWithFiles(deps: TemplateFlowDeps, actor: Admin, slot: TemplateSlot, template: Omit<StoredTemplate, keyof TemplateSlot | "updatedAt">, written: string[]) {
  let previous: StoredTemplate | null;
  try {
    previous = await deps.repo.saveTemplate(actor, slot, template);
  } catch (error) {
    await deps.remove(written);
    throw error;
  }
  if (previous) await deps.remove(templateFiles(previous).filter((url) => !templateFiles(template).includes(url)));
}

/**
 * A new photo for a slot (generic light/dark or a garment color; the warp is
 * built the same way for both). Throws AdminDataError for a slot that does not
 * exist and TemplatePhotoError for a photo that cannot be
 * used. A slot that already had a photo keeps its print area and mug curve.
 */
export async function uploadTemplatePhoto(deps: TemplateFlowDeps, actor: Admin, slot: TemplateSlot, bytes: Uint8Array): Promise<void> {
  assertTemplateSlot(slot);
  const image = await prepareTemplatePhoto(bytes);
  const current = await deps.repo.getTemplate(slot);
  const area = current?.area ?? startingArea(slot);
  const curve = slot.kind === "mug" ? (current?.curve ?? DEFAULT_MUG_CURVE) : null;
  const imageUrl = await deps.save(slotKey(slot), image);
  let warp: Warp;
  try {
    warp = await buildWarp(deps, slot, image, area, curve);
  } catch (error) {
    await deps.remove([imageUrl]);
    throw error;
  }
  await saveWithFiles(deps, actor, slot, { imageUrl, area, warp, curve }, templateFiles({ imageUrl, warp }));
}

/** Moves or resizes the print area of an uploaded photo (and sets the mug curve); the warp is rebuilt. */
export async function updateTemplateArea(
  deps: TemplateFlowDeps,
  actor: Admin,
  slot: TemplateSlot,
  box: { left: number; top: number; width: number },
  curve: number | null,
): Promise<void> {
  assertTemplateSlot(slot);
  const current = await deps.repo.getTemplate(slot);
  if (!current) throw new AdminDataError("not_found", "Subí una foto antes de marcar la zona de estampa.");
  const image = await deps.read(current.imageUrl);
  if (!image) throw new AdminDataError("not_found", "No encontramos la foto de este soporte: subila de nuevo.");
  const area = fitTemplateArea(slot.kind, box);
  const mugCurve = slot.kind === "mug" ? Math.min(1, Math.max(0, Number.isFinite(curve) ? Number(curve) : DEFAULT_MUG_CURVE)) : null;
  const warp = await buildWarp(deps, slot, image, area, mugCurve);
  await saveWithFiles(deps, actor, slot, { imageUrl: current.imageUrl, area, warp, curve: mugCurve }, templateFiles({ imageUrl: "", warp }));
}

/** Removes the uploaded photo (a color falls back to its light/dark template); the files are deleted. */
export async function resetTemplate(deps: TemplateFlowDeps, actor: Admin, slot: TemplateSlot): Promise<void> {
  assertTemplateSlot(slot);
  const removed = await deps.repo.deleteTemplate(actor, slot);
  await deps.remove(templateFiles(removed));
}
