import { AdminDataError, type Admin } from "../admin/repository.ts";
import type { PreparedDesign } from "./files.ts";
import type { DesignRepository } from "./repository.ts";
import type { DesignInput } from "./validation.ts";

type StoredFiles = { imageUrl: string; sourcePath: string };

/** What the admin flow needs; the Server Actions pass the real repository and media disk. */
export type DesignFlowDeps = {
  repo: Pick<DesignRepository, "createDesign" | "getDesign" | "setDesignImage" | "setDesignStatus" | "deleteDesign">;
  prepare: (bytes: Uint8Array) => Promise<PreparedDesign>;
  store: (slug: string, prepared: PreparedDesign) => Promise<StoredFiles>;
  remove: (files: StoredFiles) => Promise<void>;
};

export type CreatedDesign = {
  id: string;
  /** About the file (e.g. no transparency); the design was still saved. */
  warning: string | null;
  /** Why "publish now" did not happen; the design stays as a draft. */
  publishError: string | null;
};

const imageOf = (prepared: PreparedDesign, files: StoredFiles) => ({
  ...files,
  width: prepared.width,
  height: prepared.height,
  opaque: prepared.opaque,
});

/**
 * New design from the admin form. The file is checked first, so a bad upload
 * creates nothing; if storing or linking the files fails, the draft and the
 * files are removed. Throws DesignFileError or AdminDataError for the form.
 */
export async function createDesignWithFile(
  deps: DesignFlowDeps,
  actor: Admin,
  input: DesignInput,
  bytes: Uint8Array,
  options: { publish: boolean },
): Promise<CreatedDesign> {
  const prepared = await deps.prepare(bytes);
  const id = await deps.repo.createDesign(actor, input);
  let files: StoredFiles | null = null;
  try {
    files = await deps.store(input.slug, prepared);
    await deps.repo.setDesignImage(actor, id, imageOf(prepared, files));
  } catch (error) {
    if (files) await deps.remove(files).catch(() => {});
    await deps.repo.deleteDesign(actor, id).catch((cleanup) => console.error("[admin] design cleanup failed", cleanup));
    throw error;
  }

  let publishError: string | null = null;
  if (options.publish) {
    try {
      await deps.repo.setDesignStatus(actor, id, "published");
    } catch (error) {
      if (!(error instanceof AdminDataError)) throw error;
      publishError = error.message;
    }
  }
  return { id, warning: prepared.warning, publishError };
}

/** Swaps the design file; the previous files are deleted only once the design points at the new ones. */
export async function replaceDesignFile(deps: DesignFlowDeps, actor: Admin, id: string, bytes: Uint8Array): Promise<{ warning: string | null }> {
  const design = await deps.repo.getDesign(id);
  const prepared = await deps.prepare(bytes);
  const files = await deps.store(design.slug, prepared);
  let previous: StoredFiles;
  try {
    previous = await deps.repo.setDesignImage(actor, id, imageOf(prepared, files));
  } catch (error) {
    await deps.remove(files).catch(() => {});
    throw error;
  }
  await deps.remove(previous).catch(() => {});
  return { warning: prepared.warning };
}

/** Deletes the design (refused when it has orders) and then its files. */
export async function deleteDesignWithFiles(deps: DesignFlowDeps, actor: Admin, id: string): Promise<void> {
  const files = await deps.repo.deleteDesign(actor, id);
  await deps.remove(files).catch(() => {});
}
