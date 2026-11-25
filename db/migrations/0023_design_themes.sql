-- 0023 · Design themes (temáticas). A design can have several themes, separate
-- from its product category. The slug follows the designs' rule and is derived
-- from the label (see parseThemeLabel in src/server/designs/themes.ts), so labels
-- that only differ in case or accents are one theme.

CREATE TABLE design_themes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 80),
  label       text NOT NULL CHECK (length(label) BETWEEN 1 AND 60),
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- The themes of each design.
CREATE TABLE design_theme_links (
  design_id  uuid NOT NULL REFERENCES designs (id) ON DELETE CASCADE,
  theme_id   uuid NOT NULL REFERENCES design_themes (id) ON DELETE CASCADE,
  PRIMARY KEY (design_id, theme_id)
);

CREATE INDEX design_theme_links_theme_idx ON design_theme_links (theme_id);
