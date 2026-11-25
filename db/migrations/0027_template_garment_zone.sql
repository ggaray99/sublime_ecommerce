-- 0027 · Garment zone of uploaded mockup templates (Admin › Soportes): where the
-- customer can move a design on the photo (the whole torso, collar to hem), in
-- template pixels like the print area. NULL on every column = the built-in
-- zone of the kind (src/lib/designs/mockups.ts); existing rows keep it.
ALTER TABLE mockup_templates
  ADD COLUMN garment_left   integer CHECK (garment_left >= 0),
  ADD COLUMN garment_top    integer CHECK (garment_top >= 0),
  ADD COLUMN garment_width  integer CHECK (garment_width > 0),
  ADD COLUMN garment_height integer CHECK (garment_height > 0),
  ADD CONSTRAINT mockup_templates_garment_check CHECK (
    (garment_left IS NULL AND garment_top IS NULL AND garment_width IS NULL AND garment_height IS NULL)
    OR (
      garment_left IS NOT NULL AND garment_top IS NOT NULL AND garment_width IS NOT NULL AND garment_height IS NOT NULL
      AND garment_left + garment_width <= 1080 AND garment_top + garment_height <= 1080
    )
  );
