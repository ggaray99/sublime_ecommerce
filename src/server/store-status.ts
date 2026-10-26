import type { QueryFn } from "./db/client.ts";

/**
 * Whether the store is open to the public. Closed = every public page shows
 * "Estamos trabajando" (src/proxy.ts). Set from /admin/ajustes and stored in
 * store_settings; until someone sets it, SUBLIME_MAINTENANCE=1 decides.
 */
export type StoreStatus = { closed: boolean; updatedBy: string | null; updatedAt: Date | null };

export const envClosed = (env: NodeJS.ProcessEnv = process.env) => env.SUBLIME_MAINTENANCE === "1";

export function createStoreStatusRepository(sql: QueryFn) {
  return {
    async get(): Promise<StoreStatus> {
      const [row] = (await sql.query("SELECT value, updated_by, updated_at FROM store_settings WHERE key = 'store_status'")) as {
        value: { closed?: boolean };
        updated_by: string | null;
        updated_at: Date;
      }[];
      if (!row || typeof row.value.closed !== "boolean") return { closed: envClosed(), updatedBy: null, updatedAt: null };
      return { closed: row.value.closed, updatedBy: row.updated_by, updatedAt: new Date(row.updated_at) };
    },

    async save(actor: { authUserId: string; email: string }, closed: boolean): Promise<void> {
      await sql.query(
        `WITH saved AS (
           INSERT INTO store_settings (key, value, updated_by) VALUES ('store_status', $1::jsonb, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
           RETURNING key
         )
         INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
         SELECT $3, $2, 'settings.store_status', 'settings', key, $1::jsonb FROM saved`,
        [JSON.stringify({ closed }), actor.email, actor.authUserId],
      );
    },
  };
}

/**
 * For the proxy, which runs before every request: the stored status, read at
 * most every few seconds. A change in the panel reaches every visitor within
 * CACHE_MS. If the database fails, the last known value (or the env) holds.
 */
const CACHE_MS = 5_000;
let cached: { closed: boolean; at: number } | null = null;

export async function isStoreClosed(load: () => Promise<StoreStatus>): Promise<boolean> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.closed;
  try {
    cached = { closed: (await load()).closed, at: now };
  } catch {
    cached = { closed: cached?.closed ?? envClosed(), at: now };
  }
  return cached.closed;
}

/** After saving in the panel: the next request reads the new value. */
export const forgetStoreStatus = () => {
  cached = null;
};
