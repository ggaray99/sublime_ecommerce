-- 0014 · Sublime Custom Lab: stickers and T-shirts designed on the site are a
-- kind of custom request. See docs/backend/custom-lab-plan.md.

-- free = the classic request form; sticker / tshirt = made in the Lab editors.
ALTER TABLE custom_requests
  ADD COLUMN kind   text NOT NULL DEFAULT 'free' CHECK (kind IN ('free', 'sticker', 'tshirt')),
  ADD COLUMN config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- What each file is: the customer's reference, their original artwork, the
-- commercial preview, or the server-made production file (PSD for the plotter).
ALTER TABLE custom_request_files
  ADD COLUMN role   text NOT NULL DEFAULT 'reference' CHECK (role IN ('reference', 'original', 'preview', 'production')),
  ADD COLUMN width  integer CHECK (width IS NULL OR width > 0),
  ADD COLUMN height integer CHECK (height IS NULL OR height > 0);

ALTER TABLE custom_request_files DROP CONSTRAINT custom_request_files_content_type_check;
ALTER TABLE custom_request_files
  ADD CONSTRAINT custom_request_files_content_type_check CHECK (
    content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'image/vnd.adobe.photoshop'));

-- Outbox: notices are written in the same statement as what they announce and
-- sent later by a processor, so nothing is announced that was not saved.
CREATE TABLE notification_outbox (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind             text NOT NULL CHECK (kind ~ '^[a-z_]+\.[a-z_]+$'),
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts         integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  last_error       text CHECK (last_error IS NULL OR length(last_error) <= 500),
  created_at       timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz
);

CREATE INDEX notification_outbox_pending_idx ON notification_outbox (next_attempt_at) WHERE status = 'pending';

ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_entity_check;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_entity_check CHECK (
    entity IN ('product', 'inventory', 'admin', 'category', 'integration', 'order', 'shipping', 'point', 'home', 'settings'));
