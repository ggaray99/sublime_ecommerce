-- Uploaded mockup templates (Admin › Soportes). A row replaces the built-in
-- template of one kind × tone × side in the store; deleting it restores the
-- built-in one. Files live in the public media area (/media/soportes/...).
CREATE TABLE mockup_templates (
  kind        text NOT NULL CHECK (kind IN ('mug', 'tshirt', 'tank', 'sticker')),
  tone        text NOT NULL CHECK (tone IN ('light', 'dark')),
  side        text NOT NULL CHECK (side IN ('front', 'back')),
  image_url   text NOT NULL CHECK (image_url LIKE '/media/soportes/%'),
  -- Print area in template pixels (the template is a 1080 px square).
  area_left   integer NOT NULL CHECK (area_left >= 0),
  area_top    integer NOT NULL CHECK (area_top >= 0),
  area_width  integer NOT NULL CHECK (area_width > 0),
  area_height integer NOT NULL CHECK (area_height > 0),
  -- Displacement and shade maps that bend the design onto the product; a sticker has none.
  map_url     text CHECK (map_url LIKE '/media/soportes/%'),
  shade_url   text CHECK (shade_url LIKE '/media/soportes/%'),
  warp_scale  real CHECK (warp_scale > 0),
  -- Mug only: how much of the cylinder the print area spans (0 = flat, 1 = half the mug).
  curve       real CHECK (curve BETWEEN 0 AND 1),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, tone, side),
  CHECK (area_left + area_width <= 1080 AND area_top + area_height <= 1080),
  CHECK ((map_url IS NULL) = (shade_url IS NULL) AND (map_url IS NULL) = (warp_scale IS NULL))
);
