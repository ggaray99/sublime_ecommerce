-- 0002 · Customers and addresses (PostgreSQL 15+).
-- Identity lives in Neon Auth; this schema only stores the stable link to the
-- auth user id plus Sublime-specific profile data. Applied by scripts/db-migrate.mjs.

CREATE TABLE customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Neon Auth (Better Auth) user id. Never reused, never changed.
  auth_user_id  text NOT NULL UNIQUE CHECK (length(auth_user_id) BETWEEN 1 AND 100),
  email         text NOT NULL CHECK (position('@' IN email) > 1 AND length(email) <= 254),
  full_name     text NOT NULL DEFAULT '' CHECK (length(full_name) <= 120),
  phone         text CHECK (phone IS NULL OR phone ~ '^[0-9+() -]{6,30}$'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customer_addresses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  label          text NOT NULL DEFAULT '' CHECK (length(label) <= 40),
  recipient      text NOT NULL CHECK (length(recipient) BETWEEN 1 AND 120),
  street         text NOT NULL CHECK (length(street) BETWEEN 1 AND 120),
  street_number  text NOT NULL CHECK (length(street_number) BETWEEN 1 AND 10),
  apartment      text NOT NULL DEFAULT '' CHECK (length(apartment) <= 20),
  city           text NOT NULL CHECK (length(city) BETWEEN 1 AND 80),
  province       text NOT NULL CHECK (length(province) BETWEEN 1 AND 60),
  -- Argentine CPA (C1425ABC) or legacy 4-digit code.
  postal_code    text NOT NULL CHECK (postal_code ~ '^([A-Z][0-9]{4}[A-Z]{3}|[0-9]{4})$'),
  notes          text NOT NULL DEFAULT '' CHECK (length(notes) <= 200),
  is_default     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_addresses_customer_idx ON customer_addresses (customer_id);
CREATE UNIQUE INDEX customer_addresses_one_default_idx ON customer_addresses (customer_id) WHERE is_default;
