# Admin Products module: audit and redesign plan (stage 2)

- **Date:** 2026-11-27
- **Base:** `c347295` (stage 1 on QA), branch `feat/admin-products`
- **Sources:** the code (paths below) and the screens on staging at 1366 px wide
- **Reference:** Shopify Admin for the experience; `docs/admin-design-system.md` for the components

## Screens and routes

| Route | Screen | Mutations (server actions in `src/app/admin/actions.ts` unless noted) |
|---|---|---|
| `/admin/productos` | List: filter sidebar, sort, table, pagination, selection bar | None (GET forms). Export selected → `POST /admin/productos/exportar` |
| `/admin/productos/[id]` | Product: header, Datos, Venta y logística, Variantes, Imágenes, Stock, Historial | `updateProductAction`, `updateProductExtrasAction`, `configureOptionsAction`, `updateVariantAction`, `uploadProductImageAction`, `updateImageAltAction`, `moveImageAction`, `removeImageAction`, `countStockAction`, `duplicateProductAction` |
| `/admin/productos/nuevo` | New product form | `createProductAction` |
| `/admin/productos/importar` | CSV import: review, then apply | `importCatalogAction` (`importar/actions.ts`) |
| `/admin/productos/exportar` | GET full catalog CSV, POST selected ids | Audit `export.products` |

Guards: every page checks `adminAvailable()` and `getCurrentAdmin()` (store 404 for strangers); every action calls `requireAdmin()`. No products screen checks the role: owners and editors can do everything. Stage 2 keeps that.

Before this stage, the products pages used no stage-1 component. They used global classes (`account__*`, `admin-layout`, `admin-sidebar`, `admin-table*`, `admin-toolbar`, `admin-pagination`, `field`, `btn`, `panel`), the old `form-field.tsx` and `window.confirm`.

## Problems found

| # | Problem | Evidence | Proposed solution |
|---|---|---|---|
| P1 | **Products whose id has a hyphen open the store 404.** This affects `base-remera` and `base-musculosa`, the base products of the designs. | The admin repositories accepted only `/^[a-z0-9]{1,20}$/` (`repository.ts`, `images-repository.ts`, `variants-repository.ts`). The DB stores any text in `legacy_id`, and the cart accepts hyphens. | Accept `/^[a-z0-9][a-z0-9-]{0,39}$/`. All queries already use parameters. **Fixed in `8912a03`**, with tests. |
| P2 | **The table scrolls sideways at common laptop widths.** | `.admin-shell .admin-table { min-width: 760px }`. Width is also taken by the 240 px menu, the 232 px filter column plus a 16 px gap, page and card padding, a 64 px thumbnail column, the 160 px product header and the `nowrap` SKU. About 677 px are left at a 1280 px viewport. | Filters move to a bar above the table, so the column is gone. Remove the min-width. Category, SKU and variants become a second line under the name. Use a 40 px thumbnail. Columns hide below 1024 px, and below 640 px rows become cards. |
| P3 | **Status is plain text and takes a select to filter.** | `page.tsx` Estado cell; `estado` select | Tabs Todos, Publicados, Borradores and Archivados with counts (`LinkTabs`), plus a `Badge` on each row. |
| P4 | **The only bulk action is export.** | `SelectionBar` holds only `ExportSelectedButton` | Add Publicar, Pasar a borrador, Archivar, Destacar and Quitar destacado on the selection. They share the single edit's rules and its audit entry `product.update` (see `repo.updateProduct`). Confirm in a `Dialog` and report the result in a toast. |
| P5 | **Publishing means saving the whole content form.** | Estado is one select inside `ProductForm` | A publication card in the product's side column, with the status badge and a single action (Publicar / Pasar a borrador / Archivar). |
| P6 | **The product page is one long column with four separate "Guardar" buttons.** | Datos, Venta y logística, Variantes and Stock each have their own form | Two columns, like Shopify. The main column holds Datos, Imágenes, Precio y oferta, Variantes, Stock and Envío. The side column holds Publicación, Organización and Historial. Each card keeps its own form and action (no business-rule change) and names what it saves. |
| P7 | **Save feedback appears at the top of long forms; errors are generic.** | `Status` panel at the top of `ProductForm` | Success shows near the button that saved, plus a toast. On error, an error summary that links to each invalid field. |
| P8 | **Hints are placeholders that vanish while typing**, for example the slug warning. | `form-field.tsx` puts the hint in `placeholder` | Use the design system's `Input`, `Select` and `Textarea`, with the hint shown below the control. |
| P9 | **Image removal uses `window.confirm`; Duplicar has no pending state.** | `image-manager.tsx`, `confirm-button.tsx` | `ConfirmSubmitButton` (new design-system component built on `Dialog`) and a `Button` with a loading state. |
| P10 | **Image order buttons give no feedback.** | Subir, Bajar and Usar como portada are link-buttons | Icon buttons with accessible names, a pending state and a "Portada" badge. |
| P11 | **The low-stock highlight contradicts the "bajo" filter.** | The row uses `available <= 5` and ignores each product's threshold; the filter uses `BETWEEN 1 AND coalesce(threshold, 5)`. Colour is the only signal. | One rule shared with the filter. Stock shows as a Badge, "Sin stock" in critical and "Stock bajo" in warning, plus text. |
| P12 | **A product with variants shows only the default variant's price.** | Precio cell | Show "desde $X" when the variants' prices differ. |
| P13 | **Search does not apply on its own; sort and filters are two forms linked through hidden inputs.** | `page.tsx` | One GET form in a `FilterBar`. Selects apply on change; search applies with Enter or "Buscar". |
| P14 | **The list repeats the session email and role,** which the top bar already shows. | Sort toolbar | Remove them. |
| P15 | **The empty list is one muted line with no action.** | `page.tsx` | `EmptyState`: "Limpiar filtros" when filters are active, otherwise "Nuevo producto". |
| P16 | **Loading shows "Cargando el panel…", and there is no error boundary.** | Suspense fallback; no `loading.tsx` or `error.tsx` | Skeleton rows plus `error.tsx` under `/admin/productos` with "Reintentar". |
| P17 | **The `?creado`, `?copia` and `?imagen=error` banners stay on reload.** | `[id]/page.tsx` | Show them once as a toast, then clear them from the URL. |
| P18 | **The "Editar producto" title says nothing; the product name is an `h2` under it.** | `[id]/page.tsx` | `PageHeader` titled with the product name, breadcrumbs Productos › name, and the status badge as `meta`. |
| P19 | **The stock form asks for an absolute count that starts empty for variants.** | `StockForm` | Show the current count and the difference the save will record before saving. The rule does not change: the server still records a count. |
| P20 | **Import lists every row, including unchanged ones, and offers no way back after applying.** | `catalog-import.tsx` | Show only new rows, changed rows and errors; after applying, link to "Ver productos". |
| P21 | **Facet counts ignore the active filters.** | `productFacets()` | Kept as catalog totals. The status tabs make that explicit; computing counts per filter would change queries, which is out of scope. |

Known and kept: the selection covers only the current page (50 rows). Selecting every matching product and editing prices in bulk are pending items, not part of this stage.

## Design decisions

- **Permissions.** Bulk status changes are open to the same roles as the single edit (owners and editors). No new permission.
- **Business rules.** Each bulk change runs, product by product, the same validation and repository call as saving the product page. Products that would fail are reported as skipped, with the reason. Example: publishing a product with no price that is not quoted ("a pedido").
- **No schema or API change.** Bulk actions are server actions over existing repository functions. API v1 is untouched.
- **Components.** The work reuses `PageHeader`, `Breadcrumbs`, `LinkTabs`, `FilterBar`, `Badge`, `Button`, `Card`, `FormSection`, `Input`, `Select`, `Textarea`, `EmptyState`, `Skeleton`, `Pagination`, `Dialog` and `useToast`. The only new design-system component is `ConfirmSubmitButton`. Any piece specific to products lives in `src/components/admin/products/`.
