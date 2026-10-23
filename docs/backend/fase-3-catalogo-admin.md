# Fase 3 — Catálogo y administración (índice)

Numeración según el roadmap de `docs/auditoria-tecnica-backend-v1.1.md` (sección 6; hoy ese archivo está solo en local, sin commitear):

> **3. Catálogo/admin** — Persistencia, CRUD, categorías, variantes/SKU, precio, stock, imágenes y auditoría.
> **Aceptación:** permisos en el backend, validación de las subidas y regresión de filtros.

## Partes

| Parte | Documento | Estado |
| --- | --- | --- |
| 3A · Panel: precio, estado, stock y auditoría | [fase-3a-panel-admin.md](fase-3a-panel-admin.md) | ✅ Staging (código también en producción, inactivo allí) |
| 3B · La tienda lee precio, visibilidad y stock de la base | [fase-3b-tienda-desde-la-base.md](fase-3b-tienda-desde-la-base.md) | ✅ Staging |
| 3C · Contenido en la base, alta y edición completa de productos, capa de servicios | [fase-3c-contenido-en-la-base.md](fase-3c-contenido-en-la-base.md) | ✅ Staging |
| 3D · CRUD de categorías | [fase-3d-3f-categorias-e-imagenes.md](fase-3d-3f-categorias-e-imagenes.md) | ✅ Staging |
| 3E · API `/api/admin/v1` (estándar para integraciones): claves con permisos, operaciones masivas con simulación, OpenAPI | [api-admin-v1.md](api-admin-v1.md) | ✅ Staging (importación CSV, imágenes por API y promociones: próximas versiones) |
| 3F · Imágenes: subida validada (Vercel Blob) | [fase-3d-3f-categorias-e-imagenes.md](fase-3d-3f-categorias-e-imagenes.md) | ✅ Staging (Blob conectado a Preview/Development) |
| 3G · Variantes con SKU, precio y stock propios (talles, colores) | [fase-3g-variantes.md](fase-3g-variantes.md) | ✅ Staging |

## Contra los criterios del documento

| Pedido | Estado |
| --- | --- |
| Persistencia del catálogo | ✅ Productos y categorías completos en la base. |
| CRUD de productos | ✅ Alta, edición y baja lógica en el panel y por API (incluido masivo). |
| Categorías | ✅ Alta, edición, ocultar, eliminar vacías e imagen. |
| Variantes / SKU | ✅ Hasta 2 opciones y 30 combinaciones, cada una con SKU, precio y stock; en panel, tienda, carrito y API. |
| Precio y stock | ✅ |
| Imágenes | ✅ Subida, portada, orden, texto alternativo y quitar . |
| Auditoría | ✅ |
| Permisos en el backend | ✅ En cada acción del panel; en la API, claves con permisos acotados y revocables. |
| Validación de subidas | ✅ Tipo real por bytes, tamaño y medidas (`tests/image-file.test.mjs`). |
| Regresión de filtros | ✅ `tests/storefront-db.test.mjs` |

**La Fase 3 del documento queda cerrada en staging.** Lo que sigue en la API (importación CSV, imágenes por API, promociones) está en [api-admin-v1.md](api-admin-v1.md).

La Fase 4 del documento (carrito, reservas de 15 minutos y pedidos) es la siguiente.
