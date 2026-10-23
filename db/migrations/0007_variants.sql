-- 0007 · Product variants (size, color…): options per product, one variant per combination.

-- Option names in display order, e.g. {Talle} or {Talle,Color}. Empty = single variant.
ALTER TABLE products
  ADD COLUMN option_names text[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(option_names) <= 2);

ALTER TABLE product_variants
  -- Display order of the combinations (follows the order of the option values).
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT product_variants_options_object CHECK (jsonb_typeof(options) = 'object');

-- One variant per combination of values within a product.
CREATE UNIQUE INDEX product_variants_product_options_idx ON product_variants (product_id, options);
