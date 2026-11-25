-- Size-guide table of a base product kind (Admin › Soportes › each kind). The
-- store shows it on the design page as "Guía de talles". One table per kind:
-- column headers, rows of text cells (one per header) and an optional note.

-- True when rows is an array of up to 30 arrays, each holding exactly `width` strings.
CREATE FUNCTION size_guide_rows_ok(rows jsonb, width integer) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(rows) = 'array'
    AND jsonb_array_length(rows) BETWEEN 1 AND 30
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(rows) AS r(item)
      WHERE jsonb_typeof(r.item) <> 'array'
        OR jsonb_array_length(r.item) <> width
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(r.item) AS c(cell) WHERE jsonb_typeof(c.cell) <> 'string')
    )
$$;

CREATE TABLE size_guides (
  kind       text PRIMARY KEY CHECK (kind IN ('mug', 'tshirt', 'oversize', 'tank', 'sticker')),
  headers    text[] NOT NULL CHECK (cardinality(headers) BETWEEN 1 AND 8),
  rows       jsonb NOT NULL,
  note       text NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (size_guide_rows_ok(rows, cardinality(headers)))
);
