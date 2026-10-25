-- 0018 · Indexes for the admin lists (newest first, no filter) and a product's history.
-- Measured with scripts/bench/list-queries.mjs (20 000 orders, 100 000 audit rows).
CREATE INDEX orders_created_idx ON orders (created_at DESC);
CREATE INDEX custom_requests_created_idx ON custom_requests (created_at DESC);
CREATE INDEX audit_logs_entity_id_idx ON audit_logs (entity_id, id DESC);
