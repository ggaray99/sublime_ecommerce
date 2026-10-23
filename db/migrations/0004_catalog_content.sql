-- 0004 · Catalog content in the database (PostgreSQL 15+).
-- Until now copy and images lived in src/data and the database only held price,
-- status and stock. These columns let the database own the whole product.
-- Existing rows are filled by db/seed/0002_catalog_content.sql.

ALTER TABLE products
  -- Theme used by the store filters (anime, futbol, …); validated against the app list.
  ADD COLUMN theme      text NOT NULL DEFAULT 'grafico' CHECK (theme ~ '^[a-z]{1,30}$'),
  ADD COLUMN featured   boolean NOT NULL DEFAULT false,
  -- Material and usage notes, one item per line on the product page.
  ADD COLUMN details    text[] NOT NULL DEFAULT '{}',
  -- Display order in the store ("Destacados" keeps this order).
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT products_description_length CHECK (length(description) <= 2000),
  ADD CONSTRAINT products_tags_count CHECK (cardinality(tags) <= 20),
  ADD CONSTRAINT products_details_count CHECK (cardinality(details) <= 12);

CREATE INDEX products_status_sort_idx ON products (status, sort_order);

ALTER TABLE categories
  ADD COLUMN tagline   text NOT NULL DEFAULT '' CHECK (length(tagline) <= 160),
  ADD COLUMN image_url text NOT NULL DEFAULT '';

-- Audit entries for categories and machine integrations (API keys) come next.
ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_entity_check;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_entity_check CHECK (entity IN ('product', 'inventory', 'admin', 'category', 'integration'));
