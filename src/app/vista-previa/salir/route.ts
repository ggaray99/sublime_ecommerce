import { NextResponse } from "next/server";
import { PREVIEW_COOKIE, PREVIEW_FLAG_COOKIE } from "@/server/preview";

/**
 * Leaves the admin preview: clears both cookies and loads the home page as
 * customers see it. The redirect is relative: behind the proxy, request.url is
 * the container's own address.
 */
export function GET() {
  const response = new NextResponse(null, { status: 303, headers: { Location: "/", "Cache-Control": "no-store" } });
  response.cookies.delete(PREVIEW_COOKIE);
  response.cookies.delete(PREVIEW_FLAG_COOKIE);
  return response;
}
