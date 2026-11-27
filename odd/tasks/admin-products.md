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
- T3 S5 inline — shared `ConfirmSubmitButton` (Dialog instead of window.confirm) in `src/components/admin/ui`, documented. Status: done (f2bfee3, with T1).
- T3b S3,S4,S5 inline — shared `changeProducts()` (status/featured for one or many products, page validation + `product.update` audit), API v1 reuses `updateInputOf`. RED (module missing) → GREEN 7/7; 675/675. Commit 3cc1e03. Status: done.
- T4 S2,S3 delegated (writer A, parallel with T5) — list page redesign + bulk status/featured actions. RED (exports missing) → GREEN 13/13. Commit 29726b2. Status: done (browser QA in T6).
- T5 S4 delegated (writer B, parallel with T4) — product page, new and import pages + setProductStatusAction. RED (helpers missing) → GREEN 15/15. Commit c78b9be. Status: done (browser QA in T6).
- T6 S6,S7 inline — QA on staging (1366, 1024, 390), screenshots, delivery doc `docs/admin-products-redesign.md`. Status: done (see L4).

## Log

- L1 (2026-11-27) User pasted the stage-2 brief: "Iniciamos la ETAPA 2 del rediseño UX/UI de Sublime Admin." (full brief: audit, UX design, implementation, QA, delivery; "No comenzar Pedidos ni Clientes hasta completar y validar Productos.").
- L2 Audit by a read-only explorer plus staging screenshots; findings P1–P21 in `docs/admin-products-audit.md`. Route: T4 and T5 are independent units with disjoint edit surfaces, each several hundred lines → two writers in parallel (Writer trigger a). Decisions: bulk status open to the same roles as the single edit; each bulk item runs the single edit's validation; no schema or API change.
- L3 (2026-11-27) Writers returned. A: own table with container queries (Categoría hidden under 880px of list width, cards under 600px), stock badge rule `productStockState` = SQL filters incl. per-product threshold, list price range from active variants (read-only list query addition; API v1 unchanged), error.tsx uses retry(). B: two columns at ≥1024px; one action spread over two cards via `<form id>` + `form` attribute; Estado select replaced by the publication card (status sent hidden); extras success text now "Precio y envío guardados.". Parent removed the unused product forms in media-forms.tsx and an unused import in handler.ts. Combined: 704/704 tests, tsc, lint 0 problems, build green.
- L4 (2026-11-27) User: "dale, subilo a QA y validalo con Chrome". QA d6e581a → 8e1eb56 → f6d3d61 → copy fix. Chrome on staging: list/search/filters/tabs/pagination/empty, create (error summary), edit, publish/draft, stock +3, image upload/remove, variants S/M + price, bulk feature/unfeature/publish(1 changed, 1 unchanged)/archive, import review+apply. Found and fixed: filter select overlap and store link wrap; form grid stretch, file input overflow, variant price width, variants region escaping visually-hidden labels at 390 (product page overflow), import file input at 390; pre-existing import bug (unchanged variant rows refused) → 450b1a4 with RED/GREEN test; singular/plural copy. Widths: 1366 screenshots; 1024 via page zoom (container queries); 390 via same-origin popup measured by script (window could not be resized). Test product QA-REDISENO-01 left archived. Not verified: editor role, unauthenticated (staging 401).
