import { isAuthEnabled } from "@/server/auth/config";
import { getAuth } from "@/server/auth/neon";

const disabled = () => Response.json({ error: "auth_disabled" }, { status: 404 });

type Context = { params: Promise<{ path: string[] }> };

/** Neon Auth endpoints (/api/auth/*). Respond 404 where accounts are disabled. */
export async function GET(request: Request, context: Context) {
  if (!isAuthEnabled()) return disabled();
  return getAuth().handler().GET(request, context);
}

export async function POST(request: Request, context: Context) {
  if (!isAuthEnabled()) return disabled();
  return getAuth().handler().POST(request, context);
}
