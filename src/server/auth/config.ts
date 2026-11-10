import { isProductionEnv } from "../env.ts";

/**
 * Better Auth, running inside the app with accounts in our own database.
 * Customer accounts are enabled only when a database and a strong secret exist,
 * and never in production unless SUBLIME_AUTH_IN_PRODUCTION=enabled —
 * production stays a guest-only demo until accounts are approved for it.
 */
export function isAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.DATABASE_URL) return false;
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) return false;
  if (isProductionEnv(env)) return env.SUBLIME_AUTH_IN_PRODUCTION === "enabled";
  return true;
}
