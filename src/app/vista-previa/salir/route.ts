import { NextResponse } from "next/server";
import { PREVIEW_COOKIE, PREVIEW_FLAG_COOKIE } from "@/server/preview";

/** Leaves the admin preview: clears both cookies and loads the home page as customers see it. */
export function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.delete(PREVIEW_COOKIE);
  response.cookies.delete(PREVIEW_FLAG_COOKIE);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
