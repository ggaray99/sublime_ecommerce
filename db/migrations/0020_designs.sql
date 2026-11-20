-- 0020 · Design catalog. The admin uploads a design and picks the base products
-- (mug, T-shirt, tank top, sticker) it is sold on; the store previews the design
-- on each one. Base products are ordinary products linked to a mockup kind, so
-- price, variants and stock stay where they already live.

-- Which product is the base for each mockup kind (at most one per kind).
CREATE TABLE mockup_bases (
  kind        text PRIMARY KEY CHECK (kind IN ('mug', 'tshirt', 'tank', 'sticker')),
  product_id  uuid NOT NULL UNIQUE REFERENCES products (id) ON DELETE CASCADE,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE designs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 80),
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description   text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  category_id   text REFERENCES categories (id),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  -- Web preview (public media) and full-resolution PNG for production (private media).
  image_url     text NOT NULL DEFAULT '',
  source_path   text NOT NULL DEFAULT '',
  image_width   integer CHECK (image_width IS NULL OR image_width > 0),
  image_height  integer CHECK (image_height IS NULL OR image_height > 0),
  -- True when the file has no transparency (a JPG prints as a rectangle).
  opaque        boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT designs_published_image CHECK (status <> 'published' OR image_url <> '')
);

CREATE INDEX designs_status_idx ON designs (status, sort_order, created_at DESC);

-- The kinds a design is offered on.
CREATE TABLE design_bases (
  design_id  uuid NOT NULL REFERENCES designs (id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('mug', 'tshirt', 'tank', 'sticker')),
  PRIMARY KEY (design_id, kind)
);

-- Order lines remember the design they were bought with. Designs with orders are
-- archived instead of deleted (no ON DELETE), and the name is kept as sold.
ALTER TABLE order_items
  ADD COLUMN design_id   uuid REFERENCES designs (id),
  ADD COLUMN design_name text CHECK (design_name IS NULL OR length(design_name) BETWEEN 1 AND 120);

CREATE INDEX order_items_design_idx ON order_items (design_id) WHERE design_id IS NOT NULL;

ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_entity_check;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_entity_check CHECK (
    entity IN ('product', 'inventory', 'admin', 'category', 'integration', 'order', 'shipping', 'point', 'home', 'settings', 'promotion', 'design'));
