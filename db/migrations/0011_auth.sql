-- 0011 · Accounts stored in our own database (Better Auth), replacing Neon Auth.
-- Applied by scripts/db-migrate.mjs. Table and column names are mapped in
-- src/server/auth/server.ts; ids are Better Auth's random strings.
-- customers.auth_user_id and admin_users.auth_user_id hold auth_users.id.

CREATE TABLE auth_users (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  email           text NOT NULL UNIQUE,
  email_verified  boolean NOT NULL DEFAULT false,
  image           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_sessions (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES auth_users (id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);

-- One row per sign-in method; email + password keeps the password hash here.
CREATE TABLE auth_accounts (
  id                        text PRIMARY KEY,
  user_id                   text NOT NULL REFERENCES auth_users (id) ON DELETE CASCADE,
  account_id                text NOT NULL,
  provider_id               text NOT NULL,
  access_token              text,
  refresh_token             text,
  id_token                  text,
  access_token_expires_at   timestamptz,
  refresh_token_expires_at  timestamptz,
  scope                     text,
  password                  text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_accounts_user_idx ON auth_accounts (user_id);

-- Short-lived tokens (email verification, password reset) for later phases.
CREATE TABLE auth_verifications (
  id          text PRIMARY KEY,
  identifier  text NOT NULL,
  value       text NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_verifications_identifier_idx ON auth_verifications (identifier);
