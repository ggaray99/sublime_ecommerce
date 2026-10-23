# Fase 3C — Contenido del catálogo en la base y alta de productos

Estado: **activo en staging** (migración 0004 y seed 0002 aplicados el 23/10/2026). Producción sigue con el catálogo fijo.

## Qué cambió

- **La base es la dueña de todo el producto** donde está conectada. Guarda nombre, descripción, categoría, temática, etiquetas, detalles, destacado, orden, código de catálogo, precio, estado, stock e imágenes (URLs).
- **La tienda lee todo desde la base** (`src/server/catalog/postgres-storefront.ts`). El catálogo fijo de `src/data` queda solo para producción mientras no tenga base, y como fuente del seed.
- **Panel `/admin`:**
  - **Nuevo producto** (`/admin/productos/nuevo`):
    - Contenido completo, precio o "a pedido", SKU (opcional, si no se genera), stock inicial y estado.
    - Nace en **borrador** salvo que se elija otro estado.
    - El stock inicial queda como movimiento `initial_count`.
  - **Edición completa:** todos los campos de contenido, más precio y estado. La URL (slug) se puede cambiar, con advertencia porque rompe enlaces compartidos.
  - **Baja:** estado "Archivado". No se borra nada, para no romper historiales ni pedidos futuros.
  - **Historial:** muestra solo los campos que cambiaron (ej.: `precio $ 1.500 → $ 1.800, estado Publicado → Borrador`).
- **Productos sin fotos:** la tienda muestra la imagen de la categoría hasta que exista la carga de imágenes.

## Capa de servicios (base para la API)

La validación (`src/server/admin/validation.ts`) recibe **objetos simples**, no formularios. La misma función valida:

- lo que manda el panel: texto, "2.500,50", etiquetas separadas por coma, una línea por detalle, casillas `on`;
- lo que mandará la API: arrays, `priceMinor` en centavos, booleanos.

El repositorio (`src/server/admin/repository.ts`) hace cada alta o edición en **una sola sentencia SQL**: producto + variante + stock + movimiento + auditoría, todo junto o nada.

Los duplicados de URL, SKU o código de catálogo devuelven un mensaje claro. El contrato propuesto de la API está en [api-admin-v1.md](api-admin-v1.md).

## Base de datos

| Archivo | Qué hace |
| --- | --- |
| `db/migrations/0004_catalog_content.sql` | Agrega `theme`, `featured`, `details` y `sort_order` a productos, y `tagline` e `image_url` a categorías. Agrega límites (descripción ≤ 2000, ≤ 20 etiquetas, ≤ 12 detalles) y habilita auditoría de categorías e integraciones. |
| `db/seed/0002_catalog_content.sql` | Generado por `npm run db:dry-run` desde `src/data`. Copia ese contenido a los 65 productos y 6 categorías existentes. |
| `scripts/db-migrate.mjs` | Aplica todos los seeds en orden. Calcula los checksums **ignorando finales de línea**: Git en Windows reescribía los `.sql` con CRLF al cambiar de rama y el runner los tomaba como modificados. `.gitattributes` fija `*.sql` en LF. |

Ids públicos de productos nuevos: `x` + 8 caracteres (ej.: `x4k2m9q0a`). No chocan con los históricos (`p13`, `c088`). SKU automático: `SUB-<ID>`.

## Pruebas

- `tests/storefront-db.test.mjs` (13): aplica todas las migraciones y seeds en PostgreSQL (PGlite) y verifica:
  - que el catálogo leído de la base es **idéntico** al catálogo fijo, en el mismo orden;
  - que el stock se suma bien;
  - **regresión de filtros:** búsqueda por nombre y código, categoría, temática, tipo y ordenamientos dan los mismos resultados que antes;
  - que los borradores se ocultan, que precio y stock se reflejan, y que un producto sin fotos usa la imagen de la categoría.
- `tests/admin.test.mjs` (20):
  - validación compartida, para formularios y JSON;
  - alta con stock inicial, movimiento y auditoría;
  - alta "a pedido" en borrador;
  - conflictos de slug, SKU y código, sin dejar datos a medias;
  - edición con auditoría de solo lo que cambió.
- Total del proyecto: **106 tests**. Lint y build OK, también el build simulando producción.
- **Local contra staging:**
  - todas las páginas responden;
  - la tienda muestra 64 productos: 65 menos "Plancha DTF Laboratorio", que quedó en borrador de una prueba;
  - las fichas muestran los detalles desde la base.

**Pendiente de probar en la preview con sesión de admin:** crear un producto, publicarlo y verlo en la tienda; editar textos.

## Qué falta para cerrar la Fase 3 del documento técnico

Ver [fase-3-catalogo-admin.md](fase-3-catalogo-admin.md).
