-- 0024 · Oversize T-shirt: a new base product kind next to the classic T-shirt,
-- the tank top, the mug and the sticker (see MOCKUP_KINDS in src/lib/designs/kinds.ts).
-- Only the kind CHECKs widen; existing rows are kept. Custom Lab requests
-- (custom_requests.kind) are a separate list and stay as they are.
ALTER TABLE mockup_bases DROP CONSTRAINT mockup_bases_kind_check;
ALTER TABLE mockup_bases
  ADD CONSTRAINT mockup_bases_kind_check CHECK (kind IN ('mug', 'tshirt', 'oversize', 'tank', 'sticker'));

ALTER TABLE design_bases DROP CONSTRAINT design_bases_kind_check;
ALTER TABLE design_bases
  ADD CONSTRAINT design_bases_kind_check CHECK (kind IN ('mug', 'tshirt', 'oversize', 'tank', 'sticker'));

ALTER TABLE mockup_templates DROP CONSTRAINT mockup_templates_kind_check;
ALTER TABLE mockup_templates
  ADD CONSTRAINT mockup_templates_kind_check CHECK (kind IN ('mug', 'tshirt', 'oversize', 'tank', 'sticker'));
