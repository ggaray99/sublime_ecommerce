-- 0003 · Administration: roles and audit log (PostgreSQL 15+).
-- Applied by scripts/db-migrate.mjs. Admins are granted with scripts/admin-grant.mjs.

-- Staff linked to their Neon Auth user. Presence in this table is what grants
-- access to /admin; hiding links in the UI is not an authorization mechanism.
CREATE TABLE admin_users (
  auth_user_id  text PRIMARY KEY CHECK (length(auth_user_id) BETWEEN 1 AND 100),
  email         text NOT NULL CHECK (position('@' IN email) > 1),
  -- owner: everything, including future user management. editor: catalog and stock.
  role          text NOT NULL CHECK (role IN ('owner', 'editor')),
  granted_by    text NOT NULL CHECK (length(granted_by) BETWEEN 1 AND 120),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Append-only record of every administrative change.
CREATE TABLE audit_logs (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_auth_user_id  text NOT NULL,
  actor_email         text NOT NULL,
  action              text NOT NULL CHECK (action ~ '^[a-z]+\.[a-z_]+$'),
  entity              text NOT NULL CHECK (entity IN ('product', 'inventory', 'admin')),
  entity_id           text NOT NULL,
  changes             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_entity_idx ON audit_logs (entity, entity_id, created_at DESC);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
