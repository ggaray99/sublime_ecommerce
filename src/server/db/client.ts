import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Neon serverless (HTTP) client. Created lazily so builds and environments
 * without a database never touch it.
 */
let sql: NeonQueryFunction<false, false> | null = null;

/**
 * The database is used when DATABASE_URL exists, except in Vercel production,
 * which must opt in explicitly with SUBLIME_DB_IN_PRODUCTION=enabled. This keeps
 * production on the static catalog even if a staging database is accidentally
 * connected to the Production environment.
 */
export function hasDatabase(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.DATABASE_URL) return false;
  if (env.VERCEL_ENV === "production") return env.SUBLIME_DB_IN_PRODUCTION === "enabled";
  return true;
}

export function getSql(): NeonQueryFunction<false, false> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  if (!sql) sql = neon(url);
  return sql;
}
