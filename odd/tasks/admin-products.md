# Admin Products redesign (stage 2)

Objective: redesign the admin Products module (list, product page, new, import) on the stage-1 design system, Shopify Admin as UX reference. Branch `feat/admin-products` from `c347295`. Delivery: ask-on-risk. Runner: `npm.cmd test` (node --test), `npm.cmd run lint`, `DATABASE_URL= npm.cmd run build`.

## Specs

- S1 Audit first: "Analizá todas las pantallas y rutas de Productos. Revisá listado, ficha, creación, edición e importación. Identificá componentes reutilizables. Revisá filtros, búsqueda, paginación y acciones. Identificá problemas de usabilidad. Revisá los estados de carga, error y vacío. Documentá los problemas encontrados y sus soluciones propuestas." → `docs/admin-products-audit.md`.
- S2 "existe un problema conocido de overflow horizontal en la tabla de productos. Debe resolverse en esta etapa."
- S3 List: "Encabezado con título y acciones principales. Búsqueda. Filtros combinables. Pestañas o vistas por estado, si aportan valor. Tabla consistente y responsive. Miniatura del producto. Nombre y SKU. Categoría. Precio. Stock. Estado de publicación. Acciones contextuales. Selección múltiple y operaciones masivas. Paginación."
- S4 Product page: "La ficha del producto debe organizar la información por secciones lógicas, evitando formularios extensos y desordenados." "Revisá también la experiencia de variantes, imágenes, precios, stock y publicación."
- S5 Implementation: "Reutilizar el Design System de la etapa 1. No duplicar componentes. Mantener TypeScript estricto. No alterar reglas de negocio. No modificar contratos de API ni esquemas de base de datos sin justificación. Preservar permisos y validaciones. No introducir datos ficticios. No afectar la tienda pública. Mantener compatibilidad con las rutas existentes."
- S6 QA: "Listado. Búsqueda. Filtros. Paginación. Creación. Edición. Variantes. Imágenes. Importación. Publicación y despublicación. Acciones masivas. Permisos." on "1366 × 768. 1024 px. 390 px." "Generar capturas reales de las pantallas principales." "Ejecutar lint, build y tests."
- S7 Delivery docs: "Problemas encontrados. Soluciones implementadas. Componentes reutilizados y nuevos. Cambios funcionales. Resultados de QA. Riesgos y pendientes."
- S8 "No comenzar Pedidos ni Clientes hasta completar y validar Productos."

## Tasks

- T1 S1 inline — audit doc `docs/admin-products-audit.md`. Status: done.
- T2 S5 inline — P1 hyphenated product ids 404 (base-remera). RED (getProduct not_found) → GREEN; 668/668. Commit 8912a03. Status: done.
- T3 S5 inline — shared `ConfirmSubmitButton` (Dialog instead of window.confirm) in `src/components/admin/ui`, documented. Status: done (commit with T1).
- T4 S2,S3 delegated (writer A, parallel with T5) — list page redesign + bulk status/featured actions. Status: pending.
- T5 S4 delegated (writer B, parallel with T4) — product page, new and import pages. Status: pending.
- T6 S6,S7 inline — QA on staging (1366, 1024, 390), screenshots, delivery doc. Status: pending.

## Log

- L1 (2026-11-27) User pasted the stage-2 brief: "Iniciamos la ETAPA 2 del rediseño UX/UI de Sublime Admin." (full brief: audit, UX design, implementation, QA, delivery; "No comenzar Pedidos ni Clientes hasta completar y validar Productos.").
- L2 Audit by a read-only explorer plus staging screenshots; findings P1–P21 in `docs/admin-products-audit.md`. Route: T4 and T5 are independent units with disjoint edit surfaces, each several hundred lines → two writers in parallel (Writer trigger a). Decisions: bulk status open to the same roles as the single edit; each bulk item runs the single edit's validation; no schema or API change.
