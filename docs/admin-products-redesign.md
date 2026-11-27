# Admin Products redesign (stage 2): delivery

- **Date:** 2026-11-27
- **Branch:** `feat/admin-products`, on QA from `c347295` (stage 1)
- **Audit:** `docs/admin-products-audit.md` (problems P1–P21)
- **Components:** `docs/admin-design-system.md`
- **Task log:** `odd/tasks/admin-products.md`

## Problems found

The audit lists 21 problems, each with its evidence. These were the important ones:

- **P1.** Base products with variants (`base-remera`, `base-musculosa`) opened the store 404 in the panel.
- **P2.** The product table scrolled sideways at laptop widths.
- **P5.** Publishing a product meant saving the whole content form.
- **P6.** The product page was one long column with four separate save buttons.
- **P11.** The low-stock highlight disagreed with the "Stock bajo" filter.
- **P8, P9.** Field hints vanished while typing, and confirmations used the browser's own window.
- **P4.** Selection could only export.

QA turned up one more, which had been there before this stage:

- **Import of products with variants.** Re-importing an exported sheet without changes failed on every row of a product with variants.

## Solutions implemented

| Commit | Change |
| --- | --- |
| `8912a03` | Product ids with hyphens open in the panel (P1). |
| `f2bfee3` | Audit, plus the `ConfirmSubmitButton` component. |
| `3cc1e03` | `changeProducts()` changes status or featured for one or many products, with the product page's validation and its `product.update` audit entry. API v1 reuses `updateInputOf`. |
| `29726b2` | The products list (details below). |
| `c78b9be` | The product page, the new product page and the import page (details below). |
| `450b1a4` | The import refuses content changes on variant rows only when a value differs (found in QA). |
| `8e1eb56`, `f6d3d61` | Layout fixes found in QA: filter selects, file inputs, field heights in form grids, variant price width, the variants scroll region, page titles. |

**List** (`/admin/productos`, `29726b2`):

- **Header.** Title with the Nuevo producto, Importar planilla and Exportar planilla actions.
- **Status tabs.** Todos, Publicados, Borradores and Archivados, with catalog totals.
- **Filters.** One filter bar. Selects apply on change; search applies with Enter or "Buscar". The URL parameters are the same as before.
- **Table.**
  - No minimum width. Category is hidden when the list is under 880 px wide.
  - Below 600 px each row becomes a card.
  - Product name with SKU and variant count, plus a "Destacado" badge.
  - Price shows "desde $X" when the variants' prices differ.
  - Stock badges ("Sin stock", "Stock bajo") use the same rule as the filters, including each product's own threshold.
  - Status badge, and "Ver en la tienda" for published products.
- **Bulk actions.** Publicar, Pasar a borrador, Archivar, Destacar and Quitar destacado, each with a confirmation dialog and a result toast. Products that cannot change are listed with the reason.
- **States.** Empty state with an action, skeleton while loading, and `error.tsx` with "Reintentar".

**Product page** (`/admin/productos/[id]`, `c78b9be`):

- **Header.** The product name as title, breadcrumbs, status and featured badges, Ver en la tienda and Duplicar.
- **Layout.** Two columns from 1024 px.
  - Main column: Datos del producto, Imágenes, Precio y oferta, Variantes, Stock, Envío.
  - Side column: Publicación, Organización, Historial.
- **Publication card.** Publicar, Pasar a borrador, Archivar (confirmed) or Volver a borrador. It uses `setProductStatusAction` over `changeProducts()`.
- **Saving.** Each existing action receives exactly the same fields as before. One action can span two cards, through a `<form id>` and the `form` attribute on each control. Buttons say what they save: "Guardar datos", "Guardar precio y envío".
- **Feedback.** Success shows next to the button that saved, plus a toast. Errors show as a summary with links to the fields, which are marked `aria-invalid`. The notices "creado", "copia" and "imagen=error" show once as toasts and are then cleared from the URL.
- **Images.** "Portada" badge, move buttons with accessible names and a pending state, and Quitar with a Dialog.
- **Stock.** Before saving, the form shows the difference that will be recorded ("Se registra +3").
- **New product and import pages.** Same design. The import review shows only the rows that change or fail, and links to "Ver productos" after applying.

## Components

- **Reused from stage 1:** PageHeader, Breadcrumbs, LinkTabs, Badge, Button, Card, Input, Select, Textarea, EmptyState, Skeleton, Pagination, Dialog, useDialog, useToast and DataTable (import review). Also the existing SelectableTable, SelectionBar and AutoSubmitForm.
- **New in the design system:** `ConfirmSubmitButton`, a submit button confirmed in a Dialog. It replaces `window.confirm` in the products module.
- **New, specific to products** (`src/components/admin/products/`):
  - list table, filters, skeleton and bulk actions;
  - product form, publication card, image tools, stock form, notices and duplicate button.
- **Removed:** `ProductForm` and `StockForm` from `forms.tsx`, which moved to `products/`; and the unused product image forms in `media-forms.tsx`.

## Functional changes

- **Status.** It is no longer a select inside the content form; it changes from the Publicación card. The content form still sends the current status unchanged.
- **Bulk actions.** New: status and featured. They are open to the same roles that can edit a product, owners and editors, with no new permission.
- **Import.** Re-importing an unchanged exported sheet no longer fails on products with variants.
- **Unchanged:**
  - Rules: validation, prices, stock and audit.
  - Routes and URL parameters.
  - Permissions.
  - Database schema and API v1.
  - Store styles.

## QA results

**Automated:** 705 tests, lint with 0 problems, build green. New tests:

- `tests/admin-product-changes.test.mjs`: 7 tests.
- `tests/admin-products-list.test.mjs`: 13 tests.
- `tests/admin-product-page.test.mjs`: 15 tests.
- Hyphenated product ids, in `admin.test.mjs`.
- Round-trip of a product with variants, in `catalog-csv.test.mjs`.

**On staging with an admin session:**

| Check | Result |
| --- | --- |
| Listado, búsqueda (name and SKU), filtros alone and combined, tabs, paginación, empty state | OK |
| Creación: the error summary links and focuses fields; product created as a draft; one-time toast; URL cleared | OK |
| Edición ("Guardar datos") | OK |
| Publicar / Pasar a borrador from the card | OK |
| Stock: preview "+3", movement 5 → 8 recorded | OK |
| Imágenes: upload, "Portada", Quitar with Dialog | OK |
| Variantes: create sizes S and M, change a price | OK |
| Bulk: Destacar and Quitar destacado on 2 products | OK |
| Bulk: Publicar on 2 products gives "1 publicado, 1 sin cambios" | OK |
| Bulk: Archivar | OK |
| Importación: review, then apply a price change; "Ver productos" link | OK, after `450b1a4` |

**Widths:**

| Width | Pages | Result | How it was checked |
| --- | --- | --- | --- |
| 1366 × 768 (viewport 1366 × 543) | List, product page, new product, import | No horizontal scroll | Screenshots |
| 1024 | List, product page | Category column hidden, two columns kept | Page zoom (layout breakpoints are container queries) |
| 390 | List, product page, new product, import, selection bar | No page overflow, rows as cards, menu off-canvas, one column | A same-origin popup measured by script. The Chrome window could not be resized, so there are no screenshots at this width. |

**Test data.** "QA rediseño Productos (prueba editada)" (SKU `QA-REDISENO-01`) was created on staging and left **archived**; the panel has no product delete. Featured changes on two remeras were reverted.

## Risks and pending items

- **Permissions not tried in a browser.**
  - There is no editor account on staging. Permissions are unchanged: every page and action keeps `getCurrentAdmin`/`requireAdmin`, and bulk actions call `requireAdmin()`.
  - Unauthenticated access answers staging's own 401 before the app.
- **The selection bar pushes the table down when the first row is checked.** A fast second click can land on another row. It is shared with Pedidos and Encargos; fix it with those modules.
- **The selection bar and "Exportar seleccionados (CSV)"** still use the older global button style next to the new bulk buttons.
- **Selection is per page (50).** There is no "select all N results" and no bulk price edit.
- **Facet counts** in the filters and tabs are catalog totals; they do not follow the active filters.
- **The product tab title** is "Producto · Administración", without the product's name.
