/**
 * Neon Auth (managed Better Auth). Customer accounts are enabled only when the
 * auth URL and a cookie secret exist, and never in Vercel production unless
 * SUBLIME_AUTH_IN_PRODUCTION=enabled — production stays a guest-only demo until
 * accounts are approved for it.
 */
export function isAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.NEON_AUTH_BASE_URL) return false;
  if (!env.NEON_AUTH_COOKIE_SECRET || env.NEON_AUTH_COOKIE_SECRET.length < 32) return false;
  if (env.VERCEL_ENV === "production") return env.SUBLIME_AUTH_IN_PRODUCTION === "enabled";
  return true;
}
