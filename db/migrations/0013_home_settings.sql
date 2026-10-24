-- 0013 · Home page content edited from /admin/portada. The values live in
-- store_settings (key 'home_hero'); this only lets their changes be audited.

ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_entity_check;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_entity_check CHECK (
    entity IN ('product', 'inventory', 'admin', 'category', 'integration', 'order', 'shipping', 'point', 'home'));
