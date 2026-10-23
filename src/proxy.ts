import { NextResponse, type NextRequest } from "next/server";
import { isAuthEnabled } from "@/server/auth/config";
import { getAuth } from "@/server/auth/neon";

/**
 * Protects the account area and the admin panel (admin pages additionally check
 * admin_users on the server). Where accounts are disabled (production today),
 * requests pass through and the pages explain that accounts are not available.
 */
export default async function proxy(request: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.next();
  return getAuth().middleware({ loginUrl: "/cuenta/ingresar" })(request);
}

export const config = {
  matcher: ["/cuenta", "/cuenta/direcciones/:path*", "/admin", "/admin/:path*"],
};
