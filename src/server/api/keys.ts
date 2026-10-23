import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { QueryFn } from "../customers/repository.ts";
import type { Admin } from "../admin/repository.ts";

export const API_SCOPES = ["catalog:read", "catalog:write", "prices:write", "stock:write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const SCOPE_LABELS: Record<ApiScope, string> = {
  "catalog:read": "Leer catálogo",
  "catalog:write": "Crear, editar y archivar productos",
  "prices:write": "Actualizar precios",
  "stock:write": "Registrar stock",
};

/** Requests per key per minute. */
export const RATE_LIMIT = 120;

export type ApiKey = { id: string; name: string; prefix: string; scopes: ApiScope[]; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null };

/** sk_sublime_<8 chars prefix>_<43 chars secret> */
const KEY_FORMAT = /^sk_sublime_([a-z0-9]{8})_([A-Za-z0-9_-]{43})$/;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const base36 = (bytes: Buffer) => [...bytes].map((byte) => (byte % 36).toString(36)).join("");

export function generateApiKey() {
  const prefix = base36(randomBytes(8));
  const secret = randomBytes(32).toString("base64url");
  return { token: `sk_sublime_${prefix}_${secret}`, prefix, secretHash: sha256(secret) };
}

/** Audit identity of an integration, shaped like an admin for the shared repositories. */
export const integrationActor = (key: Pick<ApiKey, "id" | "name">): Admin => ({
  authUserId: `integration:${key.id}`,
  email: `integration:${key.name}`,
  role: "editor",
});

type KeyRow = {
  id: string;
  name: string;
  prefix: string;
  secret_hash: string;
  scopes: ApiScope[];
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
};

const toKey = (row: KeyRow): ApiKey => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  scopes: row.scopes,
  createdAt: new Date(row.created_at),
  lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
  revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
});

export class ApiKeyError extends Error {}

export function createApiKeyRepository(sql: QueryFn) {
  return {
    async listKeys(): Promise<ApiKey[]> {
      const rows = (await sql.query("SELECT * FROM api_keys ORDER BY revoked_at NULLS FIRST, created_at DESC")) as KeyRow[];
      return rows.map(toKey);
    },

    /** Returns the full key, which is never stored nor shown again. */
    async createKey(admin: Admin, name: string, scopes: ApiScope[]): Promise<{ key: ApiKey; token: string }> {
      const generated = generateApiKey();
      try {
        const [row] = (await sql.query(
          `WITH created AS (
             INSERT INTO api_keys (name, prefix, secret_hash, scopes, created_by)
             VALUES ($1, $2, $3, $4::text[], $5) RETURNING *
           ),
           logged AS (
             INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
             SELECT $6, $5, 'integration.create', 'integration', name, jsonb_build_object('scopes', $4::text[]) FROM created
           )
           SELECT * FROM created`,
          [name, generated.prefix, generated.secretHash, scopes, admin.email, admin.authUserId],
        )) as KeyRow[];
        return { key: toKey(row), token: generated.token };
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new ApiKeyError("Ya existe una integración con ese nombre.");
        throw error;
      }
    },

    async revokeKey(admin: Admin, id: string): Promise<void> {
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiKeyError("La clave no existe.");
      await sql.query(
        `WITH revoked AS (UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING name)
         INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id)
         SELECT $2, $3, 'integration.revoke', 'integration', name FROM revoked`,
        [id, admin.authUserId, admin.email],
      );
    },

    /** Finds an active key by its public prefix and compares the secret hash in constant time. */
    async authenticate(token: string): Promise<ApiKey | null> {
      const match = KEY_FORMAT.exec(token);
      if (!match) return null;
      const [row] = (await sql.query("SELECT * FROM api_keys WHERE prefix = $1 AND revoked_at IS NULL", [match[1]])) as KeyRow[];
      if (!row) return null;
      const expected = Buffer.from(row.secret_hash, "hex");
      const actual = Buffer.from(sha256(match[2]), "hex");
      if (!timingSafeEqual(expected, actual)) return null;
      await sql.query("UPDATE api_keys SET last_used_at = now() WHERE id = $1", [row.id]);
      return toKey(row);
    },

    /** Counts this request in the current minute and returns the total so far. */
    async hit(keyId: string): Promise<number> {
      const [row] = (await sql.query(
        `WITH cleanup AS (DELETE FROM api_rate_limits WHERE key_id = $1 AND window_start < date_trunc('minute', now()) - interval '1 hour')
         INSERT INTO api_rate_limits (key_id, window_start, requests) VALUES ($1, date_trunc('minute', now()), 1)
         ON CONFLICT (key_id, window_start) DO UPDATE SET requests = api_rate_limits.requests + 1
         RETURNING requests`,
        [keyId],
      )) as { requests: number }[];
      return row.requests;
    },

    async findIdempotent(keyId: string, idempotencyKey: string) {
      const [row] = (await sql.query(
        `SELECT request_hash, status, body FROM api_idempotency
         WHERE key_id = $1 AND idempotency_key = $2 AND created_at > now() - interval '24 hours'`,
        [keyId, idempotencyKey],
      )) as { request_hash: string; status: number; body: unknown }[];
      return row ? { requestHash: row.request_hash, status: row.status, body: row.body } : null;
    },

    async saveIdempotent(keyId: string, idempotencyKey: string, requestHash: string, status: number, body: unknown) {
      await sql.query(
        `WITH cleanup AS (DELETE FROM api_idempotency WHERE created_at < now() - interval '24 hours')
         INSERT INTO api_idempotency (key_id, idempotency_key, request_hash, status, body)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (key_id, idempotency_key) DO UPDATE
           SET request_hash = EXCLUDED.request_hash, status = EXCLUDED.status, body = EXCLUDED.body, created_at = now()`,
        [keyId, idempotencyKey, requestHash, status, JSON.stringify(body)],
      );
    },
  };
}

export type ApiKeyRepository = ReturnType<typeof createApiKeyRepository>;
export { sha256 as hashRequest };
