import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { getPool } from "../db/client.ts";
import { isAuthEnabled } from "./config.ts";

/** Maps Better Auth's models to the snake_case tables of db/migrations/0011_auth.sql. */
const TIMESTAMPS = { createdAt: "created_at", updatedAt: "updated_at" } as const;

function createAuth() {
  return betterAuth({
    database: getPool(),
    secret: process.env.BETTER_AUTH_SECRET,
    // Public URL of this deployment (https://sublime.consulte.app); cookies and redirects use it.
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128, autoSignIn: true },
    user: {
      modelName: "auth_users",
      fields: { emailVerified: "email_verified", ...TIMESTAMPS },
    },
    session: {
      modelName: "auth_sessions",
      fields: { userId: "user_id", expiresAt: "expires_at", ipAddress: "ip_address", userAgent: "user_agent", ...TIMESTAMPS },
    },
    account: {
      modelName: "auth_accounts",
      fields: {
        userId: "user_id",
        accountId: "account_id",
        providerId: "provider_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        ...TIMESTAMPS,
      },
    },
    verification: {
      modelName: "auth_verifications",
      fields: { expiresAt: "expires_at", ...TIMESTAMPS },
    },
    // Lets Server Actions set and clear the session cookie. Must be the last plugin.
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

let instance: Auth | null = null;

/** Lazily created so builds and environments without auth never instantiate it. */
export function getAuth(): Auth {
  if (!isAuthEnabled()) throw new Error("Accounts are not enabled in this environment");
  instance ??= createAuth();
  return instance;
}

export type SessionUser = { id: string; email: string; name: string };

/** Current signed-in user, or null (also null when auth is disabled). */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isAuthEnabled()) return null;
  const session = await getAuth().api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user?.id || !user.email) return null;
  return { id: user.id, email: user.email, name: user.name ?? "" };
}
