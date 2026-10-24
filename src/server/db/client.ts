import { Pool } from "pg";
import { isProductionEnv } from "../env.ts";

/** What every repository needs: run one parameterized statement, get its rows. */
export type QueryFn = { query(text: string, params?: unknown[]): Promise<unknown[]> };

/**
 * Standard PostgreSQL over TCP (node-postgres). The pool is created lazily so
 * builds and environments without a database never touch it. Every repository
 * keeps its writes atomic with single statements, so no client is ever held
 * across calls.
 */
let pool: Pool | null = null;
let sql: QueryFn | null = null;

/**
 * The database is used when DATABASE_URL exists, except in production, which
 * must opt in explicitly with SUBLIME_DB_IN_PRODUCTION=enabled. This keeps
 * production on the static catalog even if a staging database is accidentally
 * configured there.
 */
export function hasDatabase(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.DATABASE_URL) return false;
  if (isProductionEnv(env)) return env.SUBLIME_DB_IN_PRODUCTION === "enabled";
  return true;
}

/** Shared pool; also handed to Better Auth so sessions use the same connections. */
export function getPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  pool ??= new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 10), idleTimeoutMillis: 30_000 });
  return pool;
}

export function getSql(): QueryFn {
  sql ??= { query: async (text, params) => (await getPool().query(text, params)).rows };
  return sql;
}
