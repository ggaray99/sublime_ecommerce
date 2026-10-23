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
| 3D · CRUD de categorías | — | Pendiente |
| 3E · API `/api/admin/v1` con API keys y operaciones masivas | [api-admin-v1.md](api-admin-v1.md) (contrato en revisión) | Pendiente |
| 3F · Imágenes: subida validada (Vercel Blob) | — | **Requiere aprobación** del almacenamiento |
| 3G · Variantes con SKU, precio y stock propios (talles) | — | Pendiente |

## Contra los criterios del documento

| Pedido | Estado |
| --- | --- |
| Persistencia del catálogo | ✅ Productos completos en la base. Categorías: datos en la base, edición pendiente (3D). |
| CRUD de productos | ✅ Alta, edición y baja lógica en el panel. Por API: pendiente (3E). |
| Categorías | ⏳ 3D |
| Variantes / SKU | ⚠️ SKU por producto. Variantes múltiples en 3G. |
| Precio y stock | ✅ |
| Imágenes | ⏳ 3F, requiere aprobación |
| Auditoría | ✅ |
| Permisos en el backend | ✅ En cada acción. La API usará claves con permisos acotados (3E). |
| Validación de subidas | ⏳ 3F |
| Regresión de filtros | ✅ `tests/storefront-db.test.mjs` |

La Fase 4 del documento (carrito, reservas de 15 minutos y pedidos) empieza después de cerrar esta.
