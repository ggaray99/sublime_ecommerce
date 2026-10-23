-- 0005 · Category administration and uploaded product images (PostgreSQL 15+).

-- Hidden categories disappear from the store together with their products.
ALTER TABLE categories
  ADD COLUMN active boolean NOT NULL DEFAULT true,
  ADD CONSTRAINT categories_description_length CHECK (length(description) <= 1000),
  ADD CONSTRAINT categories_image_url_length CHECK (length(image_url) <= 500);

CREATE INDEX categories_active_sort_idx ON categories (active, sort_order);

-- Uploaded images keep their storage key and validated metadata. Rows from the
-- static catalog (local /demo paths) leave these columns empty.
ALTER TABLE product_images
  ADD COLUMN pathname     text CHECK (pathname IS NULL OR length(pathname) <= 300),
  ADD COLUMN content_type text CHECK (content_type IS NULL OR content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  ADD COLUMN width        integer CHECK (width IS NULL OR width > 0),
  ADD COLUMN height       integer CHECK (height IS NULL OR height > 0),
  ADD COLUMN size_bytes   integer CHECK (size_bytes IS NULL OR size_bytes > 0),
  ADD COLUMN created_at   timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT product_images_url_length CHECK (length(url) <= 500);

-- Reordering swaps positions inside one statement: check uniqueness at commit.
ALTER TABLE product_images DROP CONSTRAINT product_images_product_id_sort_order_key;
ALTER TABLE product_images
  ADD CONSTRAINT product_images_product_id_sort_order_key UNIQUE (product_id, sort_order) DEFERRABLE INITIALLY DEFERRED;
