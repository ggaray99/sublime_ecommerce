import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthEnabled } from "@/server/auth/config";

/**
 * Sends signed-out visitors of the account area and the admin panel to the
 * sign-in page. This only checks that a session cookie exists: the pages
 * validate the session on the server, and admin pages also check admin_users.
 * Where accounts are disabled, requests pass through and the pages explain it.
 */
export default function proxy(request: NextRequest) {
  if (!isAuthEnabled() || getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL("/cuenta/ingresar", request.url));
}

export const config = {
  matcher: ["/cuenta", "/cuenta/direcciones/:path*", "/admin", "/admin/:path*"],
};
