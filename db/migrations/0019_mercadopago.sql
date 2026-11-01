-- 0019 · Mercado Pago: the seller account connected from Admin → Integraciones
-- (OAuth) and the payments it notifies.
--
-- Tokens are stored encrypted by the app (AES-256-GCM, PAYMENTS_ENCRYPTION_KEY):
-- this table never holds a usable credential on its own.

CREATE TABLE payment_accounts (
  provider          text PRIMARY KEY CHECK (provider IN ('mercadopago')),
  external_user_id  text NOT NULL CHECK (external_user_id ~ '^[0-9]{1,20}$'),
  nickname          text NOT NULL DEFAULT '' CHECK (length(nickname) <= 120),
  email             text NOT NULL DEFAULT '' CHECK (length(email) <= 200),
  access_token_enc  text NOT NULL,
  refresh_token_enc text NOT NULL,
  public_key        text NOT NULL DEFAULT '',
  live_mode         boolean NOT NULL,
  expires_at        timestamptz NOT NULL,
  connected_by      text NOT NULL,
  connected_at      timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- One row per Mercado Pago order (Checkout Pro via the Orders API: one per
-- payment attempt), as last reported. Webhooks may arrive repeated or out of
-- order: the latest fetch from the API wins.
CREATE TABLE payments (
  provider       text NOT NULL CHECK (provider IN ('mercadopago')),
  external_id    text NOT NULL CHECK (external_id ~ '^[A-Za-z0-9]{1,64}$'),
  order_id       uuid NOT NULL REFERENCES orders (id),
  status         text NOT NULL CHECK (status ~ '^[a-z_]{1,40}$'),
  status_detail  text NOT NULL DEFAULT '' CHECK (length(status_detail) <= 120),
  -- Paid amount (total_paid_amount), in cents.
  amount_minor   bigint NOT NULL CHECK (amount_minor >= 0),
  currency       text NOT NULL CHECK (currency ~ '^[A-Z]{0,3}$'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, external_id)
);

CREATE INDEX payments_order_idx ON payments (order_id, created_at DESC);
