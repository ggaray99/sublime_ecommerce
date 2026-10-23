-- 0001 · Catalog and inventory foundations (PostgreSQL 15+).
-- Status: PROPOSAL FOR REVIEW. Not applied to any environment.
-- Apply only to a staging database first; never to production without approval.

BEGIN;

CREATE TABLE categories (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{1,40}$'),
  label       text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identifier from the static catalog (p08, c088…), kept for traceability of the import.
  legacy_id      text UNIQUE,
  slug           text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name           text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description    text NOT NULL DEFAULT '',
  category_id    text NOT NULL REFERENCES categories (id),
  -- Printed catalog code (e.g. 088) used by customers to order.
  catalog_code   text UNIQUE CHECK (catalog_code ~ '^[0-9]{3,6}$'),
  requires_quote boolean NOT NULL DEFAULT false,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  tags           text[] NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX products_category_status_idx ON products (category_id, status);

CREATE TABLE product_variants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  sku          text NOT NULL UNIQUE CHECK (sku ~ '^[A-Z0-9][A-Z0-9-]{1,39}$'),
  -- Attributes such as size or material once they exist (e.g. {"talle":"M"}).
  options      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Integer minor units (centavos). NULL only for quoted-on-request variants.
  price_minor  bigint CHECK (price_minor IS NULL OR price_minor >= 0),
  currency     char(3) NOT NULL DEFAULT 'ARS' CHECK (currency = upper(currency)),
  -- false = made to order / stock not tracked; quotes neither block nor promise it.
  track_stock  boolean NOT NULL DEFAULT false,
  is_default   boolean NOT NULL DEFAULT false,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX product_variants_one_default_idx ON product_variants (product_id) WHERE is_default;

CREATE TABLE product_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  url         text NOT NULL,
  alt         text NOT NULL CHECK (length(alt) BETWEEN 1 AND 200),
  sort_order  integer NOT NULL DEFAULT 0,
  UNIQUE (product_id, sort_order)
);

-- Current stock per tracked variant. reserved never exceeds on_hand.
CREATE TABLE inventory (
  variant_id  uuid PRIMARY KEY REFERENCES product_variants (id) ON DELETE CASCADE,
  on_hand     integer NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved    integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (reserved <= on_hand)
);

-- Checkout holds (15 minutes by default, decided in Fase 4). Expiry is enforced by
-- the server, never by the browser.
CREATE TABLE stock_reservations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id       uuid NOT NULL REFERENCES product_variants (id),
  quantity         integer NOT NULL CHECK (quantity > 0),
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'converted', 'released', 'expired')),
  expires_at       timestamptz NOT NULL,
  idempotency_key  text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 120),
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  CHECK ((status = 'active') = (resolved_at IS NULL))
);

CREATE INDEX stock_reservations_active_expiry_idx ON stock_reservations (expires_at) WHERE status = 'active';

-- Append-only ledger: every stock change is explained by one movement.
CREATE TABLE inventory_movements (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  variant_id      uuid NOT NULL REFERENCES product_variants (id),
  delta_on_hand   integer NOT NULL DEFAULT 0,
  delta_reserved  integer NOT NULL DEFAULT 0,
  reason          text NOT NULL CHECK (reason IN (
                    'initial_count', 'restock', 'adjustment',
                    'reservation_created', 'reservation_released', 'reservation_expired', 'sale')),
  reservation_id  uuid REFERENCES stock_reservations (id),
  actor           text NOT NULL,
  note            text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (delta_on_hand <> 0 OR delta_reserved <> 0)
);

CREATE INDEX inventory_movements_variant_idx ON inventory_movements (variant_id, created_at);

COMMIT;
