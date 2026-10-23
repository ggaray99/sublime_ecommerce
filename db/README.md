# Base de datos

PostgreSQL 15+. **Ninguna migración fue aplicada todavía**: no hay base provisionada.

- `migrations/` — SQL versionado, revisable y transaccional (`NNNN_descripcion.sql`). Se aplica en orden, primero en staging.
- `seed/0001_catalog_seed.sql` — generado por `npm run db:dry-run` desde `src/data`. No editar a mano. Precios ilustrativos: solo para staging.

El ensayo (`npm run db:dry-run`) valida el catálogo contra las mismas reglas que la migración (slugs, SKUs, códigos, duplicados, precios) y falla si encuentra problemas. No se conecta a ninguna base.

Detalle y decisiones pendientes: [docs/backend/fase-1-fundaciones.md](../docs/backend/fase-1-fundaciones.md).
