-- 0012 · Points of sale: shops and places where people find Sublime products.
-- Managed from /admin/puntos and shown on /puntos. Coordinates are optional:
-- without them the map searches the address.

CREATE TABLE points_of_sale (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  kind        text NOT NULL DEFAULT 'tienda' CHECK (kind IN ('tienda', 'kiosco', 'libreria', 'cafe', 'feria', 'otro')),
  address     text NOT NULL CHECK (length(address) BETWEEN 3 AND 160),
  city        text NOT NULL CHECK (length(city) BETWEEN 1 AND 80),
  province    text NOT NULL CHECK (length(province) BETWEEN 1 AND 60),
  latitude    numeric(9, 6) CHECK (latitude BETWEEN -90 AND 90),
  longitude   numeric(9, 6) CHECK (longitude BETWEEN -180 AND 180),
  hours       text NOT NULL DEFAULT '' CHECK (length(hours) <= 160),
  phone       text NOT NULL DEFAULT '' CHECK (length(phone) <= 40),
  instagram   text NOT NULL DEFAULT '' CHECK (length(instagram) <= 60),
  notes       text NOT NULL DEFAULT '' CHECK (length(notes) <= 300),
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- Both coordinates or neither.
  CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE INDEX points_of_sale_public_idx ON points_of_sale (active, province, city, sort_order, name);

ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_entity_check;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_entity_check CHECK (
    entity IN ('product', 'inventory', 'admin', 'category', 'integration', 'order', 'shipping', 'point'));
