import { toNextJsHandler } from "better-auth/next-js";
import { isAuthEnabled } from "@/server/auth/config";
import { getAuth } from "@/server/auth/server";

const disabled = () => Response.json({ error: "auth_disabled" }, { status: 404 });

/** Better Auth endpoints (/api/auth/*). Respond 404 where accounts are disabled. */
export async function GET(request: Request) {
  if (!isAuthEnabled()) return disabled();
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  if (!isAuthEnabled()) return disabled();
  return toNextJsHandler(getAuth()).POST(request);
}
