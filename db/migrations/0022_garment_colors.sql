-- Garment colors for the design catalog. Colors are the values of the base
-- product's "Color" variant option, stored as a key (lowercase, no accents,
-- words joined by "-", e.g. 'negro', 'verde-agua'); see colorKey() in
-- src/lib/designs/mockups.ts.

-- A template slot's tone is now 'light', 'dark' (the generic templates a color
-- without its own photo falls back to) or a color key. Existing rows are kept.
ALTER TABLE mockup_templates DROP CONSTRAINT mockup_templates_tone_check;
ALTER TABLE mockup_templates
  ADD CONSTRAINT mockup_templates_tone_check CHECK (tone ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(tone) <= 40);

-- The colors a design is offered on, per kind. A kind with no rows offers every
-- color of its base product (designs created before this table, mugs, stickers).
CREATE TABLE design_colors (
  design_id uuid NOT NULL,
  kind      text NOT NULL,
  color     text NOT NULL CHECK (color ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(color) <= 40),
  PRIMARY KEY (design_id, kind, color),
  FOREIGN KEY (design_id, kind) REFERENCES design_bases (design_id, kind) ON DELETE CASCADE
);
