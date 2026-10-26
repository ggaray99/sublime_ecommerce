import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthEnabled } from "@/server/auth/config";

/** Paths that keep working during maintenance: the admin panel and what it needs to sign in. */
const OPEN_DURING_MAINTENANCE = /^\/(mantenimiento|admin|cuenta|api\/auth|api\/admin|api\/internal|media)(\/|$)/;

/** Account area and admin panel: signed-out visitors go to the sign-in page. */
const NEEDS_SESSION = /^\/(admin(\/.*)?|cuenta|cuenta\/direcciones(\/.*)?)$/;

/**
 * Two jobs, before any page renders:
 *
 * 1. Maintenance (SUBLIME_MAINTENANCE=1, read at request time): every public
 *    page shows /mantenimiento, kept out of search engines. The admin panel
 *    stays reachable so the real catalog can be loaded before launch.
 * 2. Sends signed-out visitors of the account area and the admin panel to the
 *    sign-in page. This only checks that a session cookie exists: the pages
 *    validate the session on the server, and admin pages also check admin_users.
 *    Where accounts are disabled, requests pass through and the pages explain it.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (process.env.SUBLIME_MAINTENANCE === "1") {
    if (pathname === "/robots.txt") {
      return new NextResponse("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain" } });
    }
    if (!OPEN_DURING_MAINTENANCE.test(pathname)) {
      const response = NextResponse.rewrite(new URL("/mantenimiento", request.url));
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
      return response;
    }
  }

  if (NEEDS_SESSION.test(pathname) && isAuthEnabled() && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/cuenta/ingresar", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything but build assets, optimized images and public files (they never reveal the store).
  matcher: ["/((?!_next/static|_next/image|brand/|demo/|lab/|icon.png|apple-icon.png|favicon.ico).*)"],
};
