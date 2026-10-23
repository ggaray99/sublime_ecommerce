# Fase 1 — Fundaciones backend

Estado: **en curso, sin base de datos conectada**. Nada de esta fase cambia el sitio público hasta mergear a `main`.

## Qué existe

| Pieza | Ubicación | Estado |
|---|---|---|
| Dinero en centavos con moneda explícita | `src/server/money.ts` | Hecho |
| Repositorio de catálogo (interfaz + implementación estática) | `src/server/catalog/repository.ts` | Hecho; falta implementación Postgres |
| Repositorio de inventario (interfaz; stock no controlado por ahora) | `src/server/inventory/repository.ts` | Hecho; falta implementación Postgres |
| Recotización del carrito en servidor | `src/server/cart/quote.ts` | Hecho |
| Validación estricta de entrada | `src/server/cart/validation.ts` | Hecho |
| `POST /api/cart/quote` | `src/app/api/cart/quote/route.ts` → `src/server/cart/handler.ts` | Hecho; la UI todavía no lo usa (Fase 4) |
| Migración 0001 (catálogo, variantes/SKU, imágenes, inventario, reservas, movimientos) | `db/migrations/0001_catalog_inventory.sql` | Propuesta para revisión, **no aplicada** |
| Ensayo de importación del catálogo | `src/server/catalog/import-plan.ts`, `npm run db:dry-run` | Hecho; genera `db/seed/0001_catalog_seed.sql` |
| Tests | `tests/server-quote.test.mjs`, `tests/catalog-import.test.mjs` | 19 tests nuevos (44 en total) |

### Reglas que ya quedan fijadas en código

- El servidor **nunca** lee precios del cliente: el pedido solo trae `productId` y `quantity`; campos extra se rechazan.
- Importes enteros en centavos (`bigint` en la base), moneda `ARS` explícita.
- SKU estable: `STK-<código>` para stickers del catálogo impreso, `SUB-<ID>` para el resto.
- Productos a cotizar no tienen precio y no se pueden comprar directo.
- Stock: si un SKU no se controla (`null`), la cotización ni bloquea ni promete; si se controla, se limita a lo disponible y se informa.
- El envío figura como `pending`: no se calcula ni se promete hasta definir reglas (Fase 6).

## Contrato: `POST /api/cart/quote`

Request (`application/json`, máximo 16 KB):

```json
{ "lines": [{ "productId": "c088", "quantity": 3 }] }
```

- `lines`: 1 a 50 líneas. `productId`: `[a-z0-9-]{1,40}`. `quantity`: entero 1–99. Cualquier otro campo → 422.

Respuesta 200 (`Cache-Control: no-store`):

```json
{
  "currency": "ARS",
  "lines": [{ "productId": "c088", "sku": "STK-088", "name": "Sticker Girasol", "quantity": 3,
              "unitPriceMinor": 180000, "lineTotalMinor": 540000, "available": null }],
  "issues": [{ "productId": "p21", "code": "requires_quote", "message": "Este producto se cotiza a pedido." }],
  "subtotalMinor": 540000,
  "shipping": { "status": "pending" },
  "valid": false
}
```

- `issues[].code`: `unknown_product` · `requires_quote` · `not_purchasable` · `insufficient_stock`.
- `valid` es `true` solo si todas las líneas se pueden comprar tal como se pidieron.

Errores: `415` content-type no JSON · `413` cuerpo > 16 KB · `400` JSON inválido · `422` validación (con `fields[]`) · `405` otros métodos.

## Decisiones que necesito del negocio / del dueño de la cuenta

1. **Proveedor de PostgreSQL.** Recomendación: **Neon**, que ya está instalado en la cuenta de Vercel (plan gratis, sin vincular a ningún proyecto). Alternativa: cualquier Postgres 15+ administrado. Antes de elegir, revisar retención de backups y restauración del plan.
2. **Staging.** Opciones: (a) una rama de Neon para staging + previews de Vercel; (b) un segundo proyecto de Vercel; (c) plan Pro con entornos personalizados. Recomendación inicial: (a), sin costo.
3. **Autorización para provisionar.** Crear la base, vincularla al proyecto y que Vercel agregue la variable de conexión (no se imprime ni se commitea).
4. **Reglas de stock** (qué productos controlan stock y cuáles se fabrican a pedido) — define `track_stock` por variante.

## Próximos pasos técnicos (cuando haya aprobación)

1. Provisionar Postgres de staging y aplicar `0001` + seed de ensayo **solo en staging**.
2. Elegir driver/cliente (propuesta: `@neondatabase/serverless` o `pg` con SQL explícito; sin ORM hasta que haga falta) y un runner de migraciones con tabla de control.
3. Implementar `PostgresCatalogRepository` / `PostgresInventoryRepository` contra las mismas interfaces y correr los mismos tests en modo integración.
4. Recién después, conectar la UI del carrito a `/api/cart/quote` (Fase 4).
