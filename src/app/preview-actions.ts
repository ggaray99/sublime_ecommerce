"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PREVIEW_COOKIE, PREVIEW_FLAG_COOKIE } from "@/server/preview";

/** Leaves the admin preview: the browser goes back to what customers see. */
export async function exitPreviewAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(PREVIEW_COOKIE);
  jar.delete(PREVIEW_FLAG_COOKIE);
  redirect("/");
}
