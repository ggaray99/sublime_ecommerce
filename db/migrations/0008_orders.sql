-- 0008 · Orders with stock reservations (no online payments yet: payment is arranged).
--
-- Flow: placing an order reserves stock for 15 minutes (stock_reservations from 0001).
-- An admin confirms the payment → the reservation becomes a sale. Unconfirmed
-- reservations expire and release their stock. inventory.reserved <= on_hand is
-- what prevents overselling under concurrency.

CREATE TABLE orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Human number shown to customers (SUB-1001…).
  number          bigint GENERATED ALWAYS AS IDENTITY (START WITH 1001) UNIQUE,
  -- Secret for the guest confirmation page (/pedido/<id>?t=<token>).
  access_token    text NOT NULL CHECK (access_token ~ '^[A-Za-z0-9_-]{32,64}$'),
  customer_id     uuid REFERENCES customers (id),
  contact_name    text NOT NULL CHECK (length(contact_name) BETWEEN 2 AND 120),
  contact_email   text NOT NULL CHECK (position('@' IN contact_email) > 1 AND length(contact_email) <= 200),
  contact_phone   text NOT NULL DEFAULT '' CHECK (length(contact_phone) <= 40),
  -- { "method": "pickup" } or { "method": "shipping", "address": { … } } as entered at checkout.
  delivery        jsonb NOT NULL CHECK (delivery ->> 'method' IN ('pickup', 'shipping')),
  payment_method  text NOT NULL DEFAULT 'to_coordinate' CHECK (payment_method IN ('to_coordinate')),
  status          text NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
                    'pending_payment', 'paid', 'fulfilled', 'cancelled', 'expired', 'needs_review')),
  currency        char(3) NOT NULL DEFAULT 'ARS',
  subtotal_minor  bigint NOT NULL CHECK (subtotal_minor > 0),
  -- Shipping rules are Fase 6: unknown (NULL) until an admin sets it.
  shipping_minor  bigint CHECK (shipping_minor IS NULL OR shipping_minor >= 0),
  notes           text NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  -- Retries of the same checkout submit return the same order.
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 120),
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_status_created_idx ON orders (status, created_at DESC);
CREATE INDEX orders_customer_idx ON orders (customer_id, created_at DESC);

-- What was bought, frozen at checkout: later catalog changes never alter an order.
CREATE TABLE order_items (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id           uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  variant_id         uuid NOT NULL REFERENCES product_variants (id),
  product_legacy_id  text NOT NULL,
  sku                text NOT NULL,
  name               text NOT NULL,
  options            jsonb NOT NULL DEFAULT '{}'::jsonb,
  quantity           integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  unit_price_minor   bigint NOT NULL CHECK (unit_price_minor > 0),
  line_total_minor   bigint NOT NULL CHECK (line_total_minor = unit_price_minor * quantity)
);

CREATE INDEX order_items_order_idx ON order_items (order_id);

-- Status history: who changed what and when.
CREATE TABLE order_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  actor       text NOT NULL,
  note        text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_events_order_idx ON order_events (order_id, created_at);

ALTER TABLE stock_reservations ADD COLUMN order_id uuid REFERENCES orders (id);
CREATE INDEX stock_reservations_order_idx ON stock_reservations (order_id);

ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_entity_check;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_entity_check CHECK (entity IN ('product', 'inventory', 'admin', 'category', 'integration', 'order'));
