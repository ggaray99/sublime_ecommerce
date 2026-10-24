"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import sharp from "sharp";
import { MAX_REQUESTS_PER_HOUR, type NewRequestFile } from "@/server/custom-requests/repository";
import { customRequestsAvailable, getCustomRequestRepository } from "@/server/custom-requests/session";
import { parseRequestForm } from "@/server/custom-requests/validation";
import { getCurrentCustomer } from "@/server/customers/session";
import { deleteMediaFile, saveMediaFile } from "@/server/media/disk";
import { hasPrivateStorage } from "@/server/media/private-files";
import { buildStickerOrder, parseStickerDesigns, TOLERANCE } from "@/server/lab/sticker-order";
import { prepareSticker, StickerError } from "@/server/lab/sticker";
import { isUploadId, readLabUpload, storeLabUpload } from "@/server/lab/uploads";

const labAvailable = () => customRequestsAvailable() && hasPrivateStorage();
const UNAVAILABLE = "El Custom Lab todavía no está habilitado en este sitio.";

export type UploadResult = { ok: true; uploadId: string; name: string } | { ok: false; error: string };

/** Stores one image for the editor (private, temporary) and returns its id. */
export async function uploadLabImageAction(form: FormData): Promise<UploadResult> {
  if (!labAvailable()) return { ok: false, error: UNAVAILABLE };
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Elegí una imagen." };
  try {
    const upload = await storeLabUpload(new Uint8Array(await file.arrayBuffer()));
    return { ok: true, uploadId: upload.uploadId, name: file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "diseño" };
  } catch (error) {
    if (error instanceof StickerError) return { ok: false, error: error.message };
    throw error;
  }
}

export type StickerPreview =
  | { ok: true; image: string; sourceWidthPx: number; sourceHeightPx: number; hadTransparency: boolean; backgroundRemoved: boolean }
  | { ok: false; error: string };

/** The real server result (contour included), small enough to show in the editor. */
export async function previewStickerAction(input: { uploadId: string; sizeCm: number; removeBackground: boolean; tolerance: number }): Promise<StickerPreview> {
  if (!labAvailable()) return { ok: false, error: UNAVAILABLE };
  if (!isUploadId(input.uploadId)) return { ok: false, error: "Volvé a subir la imagen." };
  const bytes = await readLabUpload(input.uploadId);
  if (!bytes) return { ok: false, error: "La imagen ya no está disponible: volvé a subirla." };
  const sizeCm = Math.min(6, Math.max(4, Number(input.sizeCm) || 5));
  const tolerance = Math.min(TOLERANCE.max, Math.max(TOLERANCE.min, Math.round(Number(input.tolerance) || TOLERANCE.default)));
  try {
    const sticker = await prepareSticker(bytes, { sizeCm, removeBackground: input.removeBackground === true, tolerance });
    const small = await sharp(sticker.withContour).resize({ width: 360, height: 360, fit: "inside" }).png().toBuffer();
    return {
      ok: true,
      image: `data:image/png;base64,${small.toString("base64")}`,
      sourceWidthPx: sticker.sourceWidthPx,
      sourceHeightPx: sticker.sourceHeightPx,
      hadTransparency: sticker.hadTransparency,
      backgroundRemoved: sticker.backgroundRemoved,
    };
  } catch (error) {
    if (error instanceof StickerError) return { ok: false, error: error.message };
    throw error;
  }
}

export type LabFormState = { error?: string; fields?: Record<string, string>; values?: Record<string, string> };

/**
 * Places a sticker order: everything is rebuilt from the originals on the
 * server (contour, sheets, plotter PSDs), stored privately and saved as a
 * custom request of kind 'sticker'. Redirects to its private page.
 */
export async function submitStickerOrderAction(_state: LabFormState, form: FormData): Promise<LabFormState> {
  if (!labAvailable()) return { error: UNAVAILABLE };
  const values = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string").map(([k, v]) => [k, String(v)]));
  const designs = parseStickerDesigns(values.designs ?? "");
  if (!designs.ok) return { error: designs.error, values };

  const total = designs.value.reduce((sum, d) => sum + d.quantity, 0);
  const notes = (values.notes ?? "").trim().slice(0, 900);
  const parsed = parseRequestForm({
    ...values,
    productType: "Stickers troquelados",
    quantity: String(total),
    idea: `Pedido armado en el Custom Lab.${notes ? ` ${notes}` : " Sin comentarios adicionales."}`,
  });
  if (!parsed.ok) {
    return parsed.bot ? { error: parsed.errors.form } : { fields: parsed.errors as Record<string, string>, error: parsed.errors.form, values };
  }
  const repo = getCustomRequestRepository();
  const previous = await repo.findByIdempotencyKey(parsed.value.idempotencyKey);
  if (previous) redirect(`/encargo/${previous.id}?t=${previous.accessToken}`);
  if ((await repo.recentCountByEmail(parsed.value.contactEmail)) >= MAX_REQUESTS_PER_HOUR) {
    return { error: "Recibimos varias solicitudes de este email en la última hora. Probá más tarde o escribinos.", values };
  }

  let order;
  try {
    order = await buildStickerOrder(designs.value);
  } catch (error) {
    if (error instanceof StickerError) return { error: error.message, values };
    throw error;
  }

  // Every file goes to the request's own private folder.
  const folder = `lab/${randomBytes(12).toString("hex")}`;
  const stored: NewRequestFile[] = [];
  let created;
  try {
    for (const file of order.files) {
      const base = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "archivo";
      const pathname = await saveMediaFile("private", folder, base, file.extension, file.bytes);
      stored.push({ pathname, originalName: file.name, contentType: file.contentType, sizeBytes: file.bytes.length, role: file.role, width: file.width ?? null, height: file.height ?? null });
    }
    const customer = await getCurrentCustomer().catch(() => null);
    created = await repo.create({
      ...parsed.value,
      idea: `${order.summary}${notes ? `\n\n${notes}` : ""}`.slice(0, 1500),
      customerId: customer?.id ?? null,
      file: null,
      kind: "sticker",
      config: order.config,
      files: stored,
    });
  } catch (error) {
    for (const file of stored) await deleteMediaFile("private", file.pathname);
    throw error;
  }
  redirect(`/encargo/${created.id}?t=${created.accessToken}&nuevo=1`);
}
