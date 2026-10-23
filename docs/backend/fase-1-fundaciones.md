# Fase 1 — Fundaciones backend

Estado: **código listo y verificado contra PostgreSQL local; falta provisionar la base de staging**. Producción no usa base de datos y no cambia hasta mergear a `main`.

## Decisiones tomadas

| Tema | Decisión |
| --- | --- |
| Base de datos | PostgreSQL en **Neon** vía Vercel Marketplace (ya instalado en la cuenta). |
| Staging | Base Neon conectada **solo a Preview y Development**. Producción sigue con el catálogo estático. |
| Driver | `@neondatabase/serverless` (HTTP para consultas, `Pool` para migraciones). SQL explícito, sin ORM. |
| Stock | **Todo producto controla stock, excepto los personalizados** (`requiresQuote`), que se fabrican a pedido. |
| Dinero | Enteros en centavos (`bigint`), moneda `ARS` explícita. |
| SKU | `STK-<código>` para stickers del catálogo impreso, `SUB-<ID>` para el resto. |

## Qué existe

| Pieza | Ubicación |
| --- | --- |
| Dinero | `src/server/money.ts` |
| Repositorios de catálogo (estático y Postgres) | `src/server/catalog/repository.ts`, `postgres-repository.ts` |
| Repositorios de inventario (sin control y Postgres) | `src/server/inventory/repository.ts`, `postgres-repository.ts` |
| Selección de repositorios por entorno | `src/server/repositories.ts` (Postgres si hay `DATABASE_URL`) |
| Recotización del carrito en servidor | `src/server/cart/quote.ts` |
| Validación estricta de entrada | `src/server/cart/validation.ts` |
| `POST /api/cart/quote` | `src/app/api/cart/quote/route.ts` → `src/server/cart/handler.ts` (la UI todavía no lo usa: Fase 4) |
| Migración 0001 | `db/migrations/0001_catalog_inventory.sql` |
| Ensayo de importación + seed | `src/server/catalog/import-plan.ts`, `npm run db:dry-run` → `db/seed/0001_catalog_seed.sql` |
| Runner de migraciones (solo staging) | `scripts/db-migrate.mjs`, `npm run db:status` / `db:migrate` / `db:seed` |

### Reglas fijadas en código y en la base

- El servidor **nunca** lee precios del cliente: el pedido trae solo `productId` y `quantity`; campos extra → 422.
- Disponible = `on_hand − reserved`. Un producto con stock controlado **sin fila de inventario** tiene 0 disponible (no se vende lo que no se contó). Los personalizados devuelven `null` (a pedido).
- La base rechaza: stock negativo, reservas mayores al stock, precios negativos, SKU/slug/código duplicados, movimientos sin cambio y reservas con estado inconsistente.
- Cada cambio de stock queda en `inventory_movements` (el seed registra el conteo inicial).
- El envío figura como `pending`: no se calcula ni se promete (Fase 6).

### Verificación

- `npm test` — 53 tests. Incluye `tests/db-schema.test.mjs`, que aplica **la migración y el seed reales en PostgreSQL (PGlite, en memoria)** y prueba restricciones, repositorios y cotización con stock.
- `npm run test:db` — los mismos chequeos contra la base de staging real (solo lectura), cuando exista.
- Stock del seed: **20 unidades provisorias por producto**, solo para ensayo. Antes de vender hace falta el conteo real.

## Contrato: `POST /api/cart/quote`

Request (`application/json`, máximo 16 KB):

```json
{ "lines": [{ "productId": "c088", "quantity": 3 }] }
```

- `lines`: 1 a 50. `productId`: `[a-z0-9-]{1,40}`. `quantity`: entero 1–99. Otros campos → 422.

Respuesta 200 (`Cache-Control: no-store`):

```json
{
  "currency": "ARS",
  "lines": [{ "productId": "c088", "sku": "STK-088", "name": "Sticker Girasol", "quantity": 3,
              "unitPriceMinor": 180000, "lineTotalMinor": 540000, "available": 20 }],
  "issues": [{ "productId": "p21", "code": "requires_quote", "message": "Este producto se cotiza a pedido." }],
  "subtotalMinor": 540000,
  "shipping": { "status": "pending" },
  "valid": false
}
```

- `available`: unidades disponibles, o `null` si el producto se fabrica a pedido (o si no hay base conectada).
- `issues[].code`: `unknown_product` · `requires_quote` · `not_purchasable` · `insufficient_stock`.
- `valid`: `true` solo si todas las líneas se pueden comprar tal como se pidieron.

Errores: `415` no JSON · `413` > 16 KB · `400` JSON inválido · `422` validación (`fields[]`) · `405` otros métodos.

## Provisionar staging (pasos del dueño de la cuenta)

1. Vercel → proyecto **sublime-ecommerce** → **Storage** → **Create Database** → **Neon**.
2. Nombre sugerido `sublime-staging`; región **US East (Washington, `us-east-1`)**, la misma de las funciones (`iad1`).
3. Al conectar al proyecto, marcar **solo Preview y Development**. **No marcar Production.**
4. Para correr migraciones desde una máquina: `npm i -g vercel`, `vercel login`, `vercel link`, `vercel env pull .env.local --environment=preview` (el archivo está ignorado por Git y nunca se imprime).
5. Luego: `npm run db:status` → `npm run db:seed` → `npm run test:db`.

## Pendiente

- Provisionar la base (pasos de arriba) y aplicar `0001` + seed **solo en staging**.
- Conteo real de stock antes de cualquier venta.
- Fase 2 (identidad/clientes) requiere elegir proveedor de autenticación.
