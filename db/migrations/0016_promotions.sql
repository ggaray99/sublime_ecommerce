-- 0016 · Promotions: automatic or with a coupon code. The engine is
-- src/lib/promotions.ts; orders keep a frozen copy of what was applied.

CREATE TABLE promotions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  kind                text NOT NULL CHECK (kind IN ('percent', 'fixed', 'quantity_tiers', 'buy_x_pay_y', 'free_shipping', 'bundle', 'payment_method')),
  -- What it applies to: everything, some categories, or some products (public product ids).
  scope               text NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'categories', 'products')),
  category_ids        text[] NOT NULL DEFAULT '{}',
  product_ids         text[] NOT NULL DEFAULT '{}',
  -- Kind-specific values (percent, amountMinor, tiers, buy/pay, items/priceMinor, method), validated by the app.
  params              jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- With a code it only applies when the customer enters it.
  coupon_code         text UNIQUE CHECK (coupon_code IS NULL OR coupon_code ~ '^[A-Z0-9-]{3,30}$'),
  min_subtotal_minor  bigint NOT NULL DEFAULT 0 CHECK (min_subtotal_minor >= 0),
  starts_at           timestamptz,
  ends_at             timestamptz,
  max_uses            integer CHECK (max_uses IS NULL OR max_uses > 0),
  uses_count          integer NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
  -- Two people using the last coupon at once: the second order fails here instead of overspending.
  CONSTRAINT promotions_uses_limit CHECK (max_uses IS NULL OR uses_count <= max_uses)
);

CREATE INDEX promotions_active_idx ON promotions (active, starts_at, ends_at);

-- What each order paid less, and why (frozen: editing a promotion never changes past orders).
ALTER TABLE orders
  ADD COLUMN discount_minor     bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  ADD COLUMN promotions         jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN coupon_code        text,
  -- How the customer prefers to pay (payment is still arranged after the order).
  ADD COLUMN payment_preference text NOT NULL DEFAULT 'any' CHECK (payment_preference IN ('any', 'transfer')),
  ADD CONSTRAINT orders_discount_within_subtotal CHECK (discount_minor <= subtotal_minor);

CREATE TABLE promotion_redemptions (
  promotion_id    uuid NOT NULL REFERENCES promotions (id) ON DELETE CASCADE,
  order_id        uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  discount_minor  bigint NOT NULL CHECK (discount_minor >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (promotion_id, order_id)
);

ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_entity_check;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_entity_check CHECK (
    entity IN ('product', 'inventory', 'admin', 'category', 'integration', 'order', 'shipping', 'point', 'home', 'settings', 'promotion'));
