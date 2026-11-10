-- 0015 · Product logistics and commercial data: weight and dimensions (for
-- carrier quotes), stock alert threshold, sale price with dates, and cost per
-- variant (margins). Edited from the product page ("Venta y logística"), the
-- CSV import and the admin API.

ALTER TABLE products
  ADD COLUMN weight_g            integer CHECK (weight_g IS NULL OR weight_g BETWEEN 1 AND 100000),
  ADD COLUMN length_mm           integer CHECK (length_mm IS NULL OR length_mm BETWEEN 1 AND 3000),
  ADD COLUMN width_mm            integer CHECK (width_mm IS NULL OR width_mm BETWEEN 1 AND 3000),
  ADD COLUMN height_mm           integer CHECK (height_mm IS NULL OR height_mm BETWEEN 1 AND 3000),
  -- Alert when available stock of any variant falls to this number (NULL = store default).
  ADD COLUMN low_stock_threshold integer CHECK (low_stock_threshold IS NULL OR low_stock_threshold BETWEEN 0 AND 100000),
  -- Sale: a percentage off every variant, or a fixed price (single-variant products).
  ADD COLUMN sale_percent        integer CHECK (sale_percent IS NULL OR sale_percent BETWEEN 1 AND 90),
  ADD COLUMN sale_price_minor    bigint CHECK (sale_price_minor IS NULL OR sale_price_minor > 0),
  ADD COLUMN sale_starts_at      timestamptz,
  ADD COLUMN sale_ends_at        timestamptz,
  ADD CONSTRAINT products_sale_one_kind CHECK (sale_percent IS NULL OR sale_price_minor IS NULL),
  ADD CONSTRAINT products_sale_window CHECK (sale_starts_at IS NULL OR sale_ends_at IS NULL OR sale_ends_at > sale_starts_at);

ALTER TABLE product_variants
  ADD COLUMN cost_minor bigint CHECK (cost_minor IS NULL OR cost_minor >= 0);
