-- DEMO shipping rules and pickup point for STAGING. Costs, times and the address
-- are illustrative: production must load the business's real rules from /admin/envios
-- and must not run this seed.

INSERT INTO shipping_rules (scope, label, postal_codes, cost_minor, free_from_minor, eta_min_days, eta_max_days)
VALUES ('postal_code', 'Mendoza Capital (CP 5500) · demo', int4range(5500, 5501), 200000, 4000000, 1, 2);

INSERT INTO shipping_rules (scope, label, province, city, city_key, cost_minor, free_from_minor, eta_min_days, eta_max_days)
VALUES ('city', 'Godoy Cruz · demo', 'Mendoza', 'Godoy Cruz', 'godoy cruz', 250000, 4000000, 1, 2);

INSERT INTO shipping_rules (scope, label, province, cost_minor, free_from_minor, eta_min_days, eta_max_days)
VALUES ('province', 'Provincia de Mendoza · demo', 'Mendoza', 450000, 6000000, 2, 3);

INSERT INTO shipping_rules (scope, label, province, available, cost_minor, eta_min_days, eta_max_days)
VALUES ('province', 'Tierra del Fuego (sin cobertura) · demo', 'Tierra del Fuego', false, 0, 0, 0);

INSERT INTO shipping_rules (scope, label, cost_minor, eta_min_days, eta_max_days)
VALUES ('default', 'Resto del país · demo', 950000, 5, 8);

INSERT INTO store_settings (key, value, updated_by)
VALUES ('pickup', '{"enabled": true, "address": "Taller Sublime (dirección demo), Mendoza", "hours": "Lunes a viernes de 10 a 18 h (demo)", "notes": "Te avisamos cuando esté listo para retirar."}'::jsonb, 'seed');
