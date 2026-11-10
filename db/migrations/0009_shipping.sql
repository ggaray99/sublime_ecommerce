-- 0009 · Shipping: cost rules by postal code, city, province or default; pickup; tracking.
--
-- Precedence is fixed and unambiguous: postal code > city > province > default.
-- Within each level the database forbids overlaps (active rules only), so an
-- address always matches at most one rule per level.

CREATE TABLE shipping_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           text NOT NULL CHECK (scope IN ('postal_code', 'city', 'province', 'default')),
  label           text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  province        text,
  -- City as typed (for display) and normalized (lowercase, no accents) for matching.
  city            text,
  city_key        text,
  -- Numeric part of Argentine postal codes (M5500ABC → 5500), inclusive range.
  postal_codes    int4range,
  -- false = "we do not ship there" (e.g. an area without coverage).
  available       boolean NOT NULL DEFAULT true,
  cost_minor      bigint NOT NULL DEFAULT 0 CHECK (cost_minor >= 0),
  -- Free shipping when the products subtotal reaches this amount (NULL = never).
  free_from_minor bigint CHECK (free_from_minor IS NULL OR free_from_minor > 0),
  eta_min_days    integer NOT NULL DEFAULT 1 CHECK (eta_min_days BETWEEN 0 AND 60),
  eta_max_days    integer NOT NULL DEFAULT 1 CHECK (eta_max_days BETWEEN 0 AND 60),
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (eta_min_days <= eta_max_days),
  CHECK (
    (scope = 'postal_code' AND postal_codes IS NOT NULL AND NOT isempty(postal_codes)
       AND lower(postal_codes) >= 1000 AND upper(postal_codes) <= 10000 AND province IS NULL AND city IS NULL)
    OR (scope = 'city' AND province IS NOT NULL AND city IS NOT NULL AND city_key IS NOT NULL AND postal_codes IS NULL)
    OR (scope = 'province' AND province IS NOT NULL AND city IS NULL AND postal_codes IS NULL)
    OR (scope = 'default' AND province IS NULL AND city IS NULL AND postal_codes IS NULL)
  )
);

-- One active rule per city, per province and a single active default.
CREATE UNIQUE INDEX shipping_rules_city_idx ON shipping_rules (province, city_key) WHERE scope = 'city' AND active;
CREATE UNIQUE INDEX shipping_rules_province_idx ON shipping_rules (province) WHERE scope = 'province' AND active;
CREATE UNIQUE INDEX shipping_rules_default_idx ON shipping_rules ((true)) WHERE scope = 'default' AND active;
-- Postal code ranges of active rules never overlap.
ALTER TABLE shipping_rules
  ADD CONSTRAINT shipping_rules_postal_codes_excl EXCLUDE USING gist (postal_codes WITH &&) WHERE (scope = 'postal_code' AND active);

-- Small store settings, e.g. the pickup point ({ "enabled": true, "address": "…", "hours": "…" }).
CREATE TABLE store_settings (
  key         text PRIMARY KEY CHECK (key ~ '^[a-z_]{1,40}$'),
  value       jsonb NOT NULL,
  updated_by  text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Orders keep the shipping quote as it was at checkout, and tracking once shipped.
ALTER TABLE orders
  ADD COLUMN shipping      jsonb,
  ADD COLUMN tracking      jsonb,
  ADD COLUMN shipped_at    timestamptz;

ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check CHECK (status IN (
    'pending_payment', 'paid', 'shipped', 'fulfilled', 'cancelled', 'expired', 'needs_review'));

ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_entity_check;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_entity_check CHECK (entity IN ('product', 'inventory', 'admin', 'category', 'integration', 'order', 'shipping'));
