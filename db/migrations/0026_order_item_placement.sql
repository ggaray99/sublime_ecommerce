-- 0026 · Where the customer placed a catalog design on the garment, saved with
-- the order line: { kind, side, widthCm, xCm, yCm } in cm (kind is the base
-- product kind the server resolved). Only design lines can carry it; NULL for
-- every existing line and for designs bought at their standard spot.
-- Additive: a nullable column without default rewrites no existing row.
ALTER TABLE order_items
  ADD COLUMN design_placement jsonb
    CONSTRAINT order_items_design_placement_check
    CHECK (design_placement IS NULL OR (jsonb_typeof(design_placement) = 'object' AND design_id IS NOT NULL));
