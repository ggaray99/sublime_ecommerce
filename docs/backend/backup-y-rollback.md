# Backup y rollback

Procedimiento vigente para Sublime. Cubre la aplicación (Vercel) y la base de datos (Neon). Actualizar este documento cuando cambie el plan de Vercel o de Neon.

## Estado actual

| Componente | Dónde | Respaldo disponible |
| --- | --- | --- |
| Código | GitHub `ggaray99/sublime_ecommerce` | Historial completo de Git. |
| Sitio de producción | Vercel, plan **Hobby** | Rollback **solo al deployment de producción inmediatamente anterior**. |
| Base de staging | Neon `sublime-staging`, plan **Free** | Restauración a cualquier punto de las **últimas 6 horas** (máximo 1 GB de historial). |
| Base de producción | No existe todavía | — |

Producción no usa base de datos: `hasDatabase()` y `isAuthEnabled()` la ignoran en `VERCEL_ENV=production` salvo activación explícita (`SUBLIME_DB_IN_PRODUCTION` / `SUBLIME_AUTH_IN_PRODUCTION`).

## Rollback de la aplicación (Vercel)

**Cuándo:** un deploy a producción rompe el sitio.

1. Vercel → proyecto → **Deployments** → deployment de producción anterior → **Instant Rollback**.
   - En Hobby solo se puede volver al **inmediatamente anterior**. Para ir más atrás, usar la opción 2.
   - CLI equivalente: `vercel rollback <id-o-url>`.
2. Rollback por Git (sin límite de antigüedad): `git revert <commit>` en `main` y push. Vercel despliega el revert automáticamente. Preferir `revert` a `reset` para no reescribir historia publicada.
3. Verificar: rutas principales en 200, `/api/cart/quote` responde y no hay errores en **Logs / Runtime errors**.

Notas:
- El rollback de Vercel **no** revierte la base de datos ni las variables de entorno.
- Después de un Instant Rollback, Vercel deja de promover automáticamente los nuevos deploys de `main` hasta que se vuelva a promover uno manualmente.

## Backup de la base (Neon)

### Antes de cada migración (obligatorio)

1. Neon Console → proyecto `sublime-staging` → **Branches** → **Create branch** desde `main`, nombre `backup-AAAAMMDD-HHMM`. Es una copia instantánea completa.
2. Aplicar la migración: `npm run db:status` → `npm run db:migrate`.
3. Verificar: `npm run test:db`.
4. Si todo está bien, borrar ramas de backup de más de 7 días (el plan Free permite 10 ramas).

### Restauración

- **Error de las últimas 6 horas:** Neon Console → rama `main` → **Restore** (instant restore) a un momento previo, o crear una rama nueva desde ese momento para inspeccionar antes de restaurar.
- **Error más antiguo:** restaurar `main` usando como origen la rama `backup-…` creada antes de la migración (Neon Console → rama `main` → **Restore** → elegir la rama de backup como fuente).
- Después de restaurar, revisar `schema_migrations`: debe coincidir con los archivos de `db/migrations` aplicados.

## Rollback de migraciones

Las migraciones son **solo hacia adelante**: el runner (`scripts/db-migrate.mjs`) registra cada archivo con checksum y no permite modificar uno ya aplicado.

- **Revertir un cambio de esquema:** escribir una migración nueva que lo deshaga (`NNNN_revert_….sql`) y aplicarla con el mismo procedimiento.
- **Migración fallida:** cada archivo corre en una transacción junto con su registro; si falla, no queda nada aplicado a medias. Corregir el archivo (todavía no aplicado) y volver a correr.
- **Daño de datos:** restaurar la base como se describe arriba.

## Antes de tener base de producción

Pendiente de decisión, recomendado antes del lanzamiento:

- Plan de Neon con ventana de restauración mayor (Launch: hasta 7 días; Scale: hasta 30 días) o backups lógicos programados (`pg_dump`) fuera de Neon.
- Probar una restauración completa en una rama y documentar el tiempo que lleva.
- Definir responsable y canal de aviso ante incidentes.

Fuentes: [Vercel — rollback](https://vercel.com/docs/cli/rollback), [Neon — history window](https://neon.com/docs/postgres/backup-restore/history-window).
