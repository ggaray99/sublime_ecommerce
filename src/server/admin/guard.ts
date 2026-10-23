import { revalidatePath, updateTag } from "next/cache";
import { notFound } from "next/navigation";
import { ImageFileError } from "../media/image-file.ts";
import { CATALOG_TAG } from "../storefront.ts";
import { AdminDataError } from "./repository.ts";
import { getCurrentAdmin } from "./session.ts";

/** Shared by the admin Server Actions. Lives outside "use server" files so it is never callable on its own. */
export type AdminFormState = {
  error?: string;
  fields?: Record<string, string | undefined>;
  ok?: string;
  values?: Record<string, string>;
};

/**
 * Every mutation re-checks admin_users from the session cookie: the page
 * having rendered the form proves nothing about who submits it.
 */
export async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();
  return admin;
}

/** Owner-only areas (integration keys). Editors get the same 404 as strangers. */
export async function requireOwner() {
  const admin = await requireAdmin();
  if (admin.role !== "owner") notFound();
  return admin;
}

/** Form fields as a plain object (the shape the validators share with the API). Files are skipped. */
export const formValues = (form: FormData): Record<string, string> =>
  Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === "string").map(([key, value]) => [key, String(value)]));

/** Known business errors become a message on the form; anything else is a real failure. */
export function dataError(error: unknown, values?: Record<string, string>): AdminFormState {
  if (error instanceof AdminDataError || error instanceof ImageFileError) return { error: error.message, values };
  throw error;
}

/** The store and the admin pages read the cached catalog: refresh both. */
export function catalogChanged(...paths: string[]) {
  updateTag(CATALOG_TAG);
  revalidatePath("/admin", "layout");
  for (const path of paths) revalidatePath(path);
}
