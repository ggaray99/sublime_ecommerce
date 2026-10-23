import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Neon serverless (HTTP) client. Created lazily so builds and environments
 * without a database (production today) never touch it.
 */
let sql: NeonQueryFunction<false, false> | null = null;

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getSql(): NeonQueryFunction<false, false> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  if (!sql) sql = neon(url);
  return sql;
}
