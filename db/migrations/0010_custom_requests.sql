-- 0010 · Custom requests (encargos): request → quote → customer decision → production.
-- No payments yet: the quote can suggest a deposit (seña) that is only informative.

CREATE TABLE custom_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Human number shown to customers (ENC-5001…).
  number             bigint GENERATED ALWAYS AS IDENTITY (START WITH 5001) UNIQUE,
  -- Secret for the guest page (/encargo/<id>?t=<token>).
  access_token       text NOT NULL CHECK (access_token ~ '^[A-Za-z0-9_-]{32,64}$'),
  customer_id        uuid REFERENCES customers (id),
  contact_name       text NOT NULL CHECK (length(contact_name) BETWEEN 2 AND 80),
  contact_email      text NOT NULL CHECK (position('@' IN contact_email) > 1 AND length(contact_email) <= 200),
  product_type       text NOT NULL CHECK (length(product_type) BETWEEN 1 AND 60),
  quantity           integer NOT NULL CHECK (quantity BETWEEN 1 AND 100000),
  idea               text NOT NULL CHECK (length(idea) BETWEEN 20 AND 1500),
  reference          text NOT NULL DEFAULT '' CHECK (length(reference) <= 300),
  -- Product the customer came from (/encargos?producto=…), if any.
  product_slug       text CHECK (product_slug IS NULL OR product_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status             text NOT NULL DEFAULT 'received' CHECK (status IN (
                       'received', 'quoted', 'accepted', 'declined', 'in_production', 'delivered', 'cancelled')),
  -- Quote sent by the business.
  quote_minor        bigint CHECK (quote_minor IS NULL OR quote_minor > 0),
  deposit_minor      bigint CHECK (deposit_minor IS NULL OR (deposit_minor > 0 AND quote_minor IS NOT NULL AND deposit_minor <= quote_minor)),
  quote_message      text NOT NULL DEFAULT '' CHECK (length(quote_message) <= 1500),
  quote_valid_until  date,
  quote_eta_days     integer CHECK (quote_eta_days IS NULL OR quote_eta_days BETWEEN 1 AND 180),
  idempotency_key    text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 120),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('received', 'cancelled') OR quote_minor IS NOT NULL)
);

CREATE INDEX custom_requests_status_created_idx ON custom_requests (status, created_at DESC);
CREATE INDEX custom_requests_customer_idx ON custom_requests (customer_id, created_at DESC);
-- Throttle by email (anti-spam) looks up recent requests per address.
CREATE INDEX custom_requests_email_created_idx ON custom_requests (lower(contact_email), created_at DESC);

-- Reference files in PRIVATE storage: only the customer (with the link or session) and admins can read them.
CREATE TABLE custom_request_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES custom_requests (id) ON DELETE CASCADE,
  pathname      text NOT NULL CHECK (length(pathname) <= 300),
  original_name text NOT NULL CHECK (length(original_name) BETWEEN 1 AND 160),
  content_type  text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes    integer NOT NULL CHECK (size_bytes > 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX custom_request_files_request_idx ON custom_request_files (request_id);

CREATE TABLE custom_request_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id  uuid NOT NULL REFERENCES custom_requests (id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  actor       text NOT NULL,
  note        text NOT NULL DEFAULT '' CHECK (length(note) <= 1500),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX custom_request_events_request_idx ON custom_request_events (request_id, created_at);
