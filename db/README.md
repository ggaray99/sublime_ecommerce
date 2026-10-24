# Base de datos

PostgreSQL 15+ (Neon en staging hasta pasar al VPS). **Solo staging**: producción no tiene base conectada.

- `migrations/` — SQL versionado y revisable (`NNNN_descripcion.sql`). Sin `BEGIN/COMMIT`: el runner envuelve cada archivo y su registro en `schema_migrations` en una transacción.
- `seed/0001_catalog_seed.sql` — generado por `npm run db:dry-run` desde `src/data`. No editar a mano. Precios y stock (20 u.) provisorios: solo staging.

Comandos (leen `DATABASE_URL` de `.env.local`; el runner exige `--target=staging` y se bloquea si `SUBLIME_ENV` o `VERCEL_ENV` es `production`):

| Comando | Qué hace |
| --- | --- |
| `npm run db:dry-run` | Valida el catálogo contra las reglas del esquema y regenera el seed. No se conecta. |
| `npm run db:status` | Muestra migraciones aplicadas y pendientes. |
| `npm run db:migrate` | Aplica migraciones pendientes. |
| `npm run db:seed` | Aplica migraciones pendientes y el seed (una sola vez). |
| `npm run test:db` | Chequeos de solo lectura contra la base de staging. |

Los archivos aplicados quedan con checksum: modificar uno ya aplicado aborta la ejecución (se crea una migración nueva).

`npm test` incluye `tests/db-schema.test.mjs`, que corre la migración y el seed en PostgreSQL embebido (PGlite) sin tocar ninguna base.

Migraciones aplicadas en staging: `0001_catalog_inventory` (catálogo e inventario), `0002_customers` (clientes y direcciones) , `0003_admin` (administradores y auditoría) , `0004_catalog_content` (contenido del catálogo) , `0005_categories_images` (categorías administrables e imágenes subidas) , `0006_api_keys` (claves de integración, límites e idempotencia de la API) , `0007_variants` (opciones y variantes) , `0008_orders` (pedidos, ítems, historial y reservas vinculadas) `0009_shipping` (reglas de envío, retiro y seguimiento) `0010_custom_requests` (encargos, adjuntos privados e historial) y `0011_auth` (cuentas de Better Auth). Seed solo para staging: `0003_shipping_demo` (no correr en producción). Seeds: `0001_catalog_seed` y `0002_catalog_content`.

**Antes de migrar, crear una rama de backup en Neon.** Procedimiento completo: [docs/backend/backup-y-rollback.md](../docs/backend/backup-y-rollback.md).

Detalle: [Fase 1](../docs/backend/fase-1-fundaciones.md) · [Fase 2](../docs/backend/fase-2-identidad.md) · [Fase 3](../docs/backend/fase-3-catalogo-admin.md) · [Fase 4](../docs/backend/fase-4-pedidos.md) · [Fase 6](../docs/backend/fase-6-envios.md) · [Fase 7](../docs/backend/fase-7-encargos.md) · [Pendientes](../docs/backend/pendientes.md).
