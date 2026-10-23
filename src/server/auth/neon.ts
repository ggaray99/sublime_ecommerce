import { createNeonAuth } from "@neondatabase/auth/next/server";
import { isAuthEnabled } from "./config.ts";

type NeonAuth = ReturnType<typeof createNeonAuth>;

let instance: NeonAuth | null = null;

/** Lazily created so builds and environments without auth never instantiate it. */
export function getAuth(): NeonAuth {
  if (!isAuthEnabled()) throw new Error("Neon Auth is not enabled in this environment");
  instance ??= createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
  });
  return instance;
}

export type SessionUser = { id: string; email: string; name: string };

/** Current signed-in user, or null (also null when auth is disabled). */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isAuthEnabled()) return null;
  const { data } = await getAuth().getSession();
  const user = data?.user;
  if (!user?.id || !user.email) return null;
  return { id: user.id, email: user.email, name: user.name ?? "" };
}
