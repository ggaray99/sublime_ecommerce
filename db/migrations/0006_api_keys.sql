-- 0006 · Admin API (/api/admin/v1): integration keys, rate limits and idempotency.

-- One key per integration. Only a SHA-256 hash of the secret is stored; the
-- full key is shown once when it is created.
CREATE TABLE api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE CHECK (name ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(name) <= 40),
  -- Public part of the key (sk_sublime_<prefix>_…), used to find it without the secret.
  prefix        text NOT NULL UNIQUE CHECK (prefix ~ '^[a-z0-9]{8}$'),
  secret_hash   text NOT NULL CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
  scopes        text[] NOT NULL CHECK (
                  cardinality(scopes) > 0
                  AND scopes <@ ARRAY['catalog:read', 'catalog:write', 'prices:write', 'stock:write']::text[]),
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

-- Requests per key per minute.
CREATE TABLE api_rate_limits (
  key_id        uuid NOT NULL REFERENCES api_keys (id) ON DELETE CASCADE,
  window_start  timestamptz NOT NULL,
  requests      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, window_start)
);

-- Responses to writes sent with an Idempotency-Key, replayed on retries (kept 24 h).
CREATE TABLE api_idempotency (
  key_id           uuid NOT NULL REFERENCES api_keys (id) ON DELETE CASCADE,
  idempotency_key  text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 120),
  request_hash     text NOT NULL,
  status           integer NOT NULL,
  body             jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key_id, idempotency_key)
);

CREATE INDEX api_idempotency_created_idx ON api_idempotency (created_at);
