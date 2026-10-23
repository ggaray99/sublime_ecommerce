# API de administración v1 — estándar para integraciones

Estado: **implementada y activa en staging (previews)** desde el 23/10/2026. En producción responde `503` hasta que exista la base de producción.

Esta API es un **estándar de Sublime**: el contrato lo definimos nosotros y quien integre (n8n, Make, scripts, un ERP) se adapta a él. No es "la integración con n8n".

- **Contrato formal (OpenAPI 3.1):** `GET /api/admin/v1/openapi.json`. Fuente: `src/server/api/openapi.ts`.
- **Implementación:** `src/server/api/handler.ts`, sin framework y probada con requests reales en `tests/admin-api.test.mjs`. Usa la misma validación y los mismos repositorios que el panel `/admin`, así que las reglas son idénticas.
- **Claves:** se crean y revocan en `/admin/integraciones`. Solo el rol dueño (owner) puede hacerlo.

## Reglas generales

| Tema | Regla |
| --- | --- |
| Base | `/api/admin/v1`. JSON en UTF-8. Un cambio incompatible crea `/v2`; `v1` sigue funcionando mientras se migra. |
| Autenticación | `Authorization: Bearer sk_sublime_<prefijo>_<secreto>`. Hay una clave por integración. Se muestra **una sola vez** al crearla y en la base se guarda solo el hash del secreto. Se puede revocar y registra su último uso. |
| Permisos | `catalog:read`, `catalog:write`, `prices:write`, `stock:write`. Si la clave no tiene el permiso necesario, la respuesta es `403`. |
| Auditoría | Cada cambio queda en el historial del panel como `integration:<nombre>`, igual que los cambios hechos a mano. |
| Límite | 120 pedidos por minuto por clave. Al superarlo, `429` con `Retry-After`. Cada respuesta trae `X-RateLimit-Limit` y `X-RateLimit-Remaining`. |
| Idempotencia | Las escrituras aceptan `Idempotency-Key` (de 8 a 120 caracteres). Si se reenvía con el mismo cuerpo, la API devuelve la respuesta original (`Idempotent-Replayed: true`) sin aplicar nada de nuevo. Si se reenvía con otro cuerpo, responde `409`. Vale 24 horas. |
| Productos | Se identifican por `sku`. Las bajas **archivan**, no borran. |
| Dinero | `priceMinor` en **centavos enteros**, con `currency: "ARS"`. `null` significa producto a pedido. |
| Contrato estricto | Un campo o parámetro desconocido es un error `422` (no se ignora en silencio), así un error de tipeo no pasa inadvertido. |
| Lotes | Hasta 500 ítems y 1 MB por pedido. Cada ítem se aplica por separado: uno inválido no frena a los demás. |
| Simulación | Toda operación masiva acepta `"dryRun": true`: valida y devuelve el resultado que tendría, incluido el antes y el después, sin guardar nada. |
| Tienda | Después de cada cambio real, la tienda deja de mostrar el catálogo viejo en la visita siguiente. |

Errores, siempre con esta forma:

```json
{ "error": "validation_failed", "message": "Revisá los datos enviados.", "fields": [{ "path": "items[3].priceMinor", "message": "…" }] }
```

| HTTP | `error` | Cuándo |
| --- | --- | --- |
| 400 | `bad_request` | JSON inválido |
| 401 | `unauthorized` | Falta la clave, o es inválida o está revocada |
| 403 | `forbidden` | Falta el permiso |
| 404 | `not_found` | El recurso o el SKU no existe |
| 405 | `method_not_allowed` | El método no está admitido (ver encabezado `Allow`) |
| 409 | `conflict` | Slug, SKU o código duplicado, o `Idempotency-Key` reutilizada con otro cuerpo |
| 413 | `payload_too_large` | Más de 1 MB o de 500 ítems |
| 415 | `unsupported_media_type` | El cuerpo no es `application/json` |
| 422 | `validation_failed` | Datos inválidos (ver `fields`) |
| 429 | `rate_limited` | Superó el límite por minuto |
| 503 | `not_available` | La API no está habilitada en este entorno |

## Endpoints

| Método y ruta | Permiso | Qué hace |
| --- | --- | --- |
| `GET /products` | `catalog:read` | Lista paginada (`page`, `pageSize` hasta 200). Filtros: `q`, `status`, `categoryId`, `theme`, `stock` (`in`, `low`, `out`, `made_to_order`), `images` (`with`, `without`), `featured`, `sort` (`store`, `name`, `price_asc`, `price_desc`, `stock_asc`, `updated`). Con `updatedSince` (ISO 8601) se hace sincronización incremental: devuelve los cambios de producto, precio o stock desde esa fecha. |
| `GET /products/{sku}` | `catalog:read` | Un producto, con sus imágenes. |
| `POST /products` | `catalog:write` | Alta. Nace en `draft` salvo que se indique otro estado. `sku` es opcional (si falta, se genera `SUB-<ID>`). `initialStock` opcional. `requiresQuote: true` crea un producto a pedido. Responde `201`. |
| `PATCH /products/{sku}` | `catalog:write` | Cambia solo los campos enviados. |
| `POST /products/{sku}/archive` | `catalog:write` | Baja lógica. |
| `POST /products/bulk-upsert` | `catalog:write` | `{ items, dryRun }`: si el SKU existe, actualiza los campos enviados; si no, lo crea. Resultado por ítem: `created`, `updated` (con `changes`), `unchanged` o `failed`. |
| `POST /products/bulk-archive` | `catalog:write` | `{ skus, dryRun }`: baja masiva. |
| `POST /prices/bulk-update` | `prices:write` | Precio exacto: `{ items: [{ sku, priceMinor }] }`. O ajuste por regla: `{ rule, scope, rounding }`, donde `rule` es `{ type: "percent", value: 12.5 }` o `{ type: "amount", value: -5000 }`, `scope` es `{ categoryId }`, `{ skus }` o `{ all: true }`, y `rounding` es `none`, `nearest_100` (a $1) o `nearest_1000` (a $10). Nunca deja precios en $ 0 o menos, y los productos a pedido quedan `skipped`. Cada ítem incluye `before` y `after`. |
| `POST /stock/bulk-count` | `stock:write` | `{ items: [{ sku, onHand, reason, note }] }`: conteo físico. Se registra la diferencia como movimiento. `reason` es `restock` o `adjustment`, y un `adjustment` exige `note`. No puede quedar por debajo de las unidades reservadas. |
| `GET /categories` | `catalog:read` | Categorías, incluidas las ocultas, con su cantidad de productos. |

## Guía rápida para integradores

1. **Clave.** Pedirle al dueño que cree una en `/admin/integraciones` con un nombre descriptivo (ej.: `n8n-precios`) y **solo los permisos necesarios**. Guardarla como credencial secreta en la herramienta, nunca en el flujo ni en un repositorio.
2. **Contrato.** Importar `/api/admin/v1/openapi.json` en la herramienta si lo admite, o usarlo de referencia.
3. **Simulación primero.** Correr cada carga masiva con `"dryRun": true`, revisar `summary` e `items`, y recién después correrla sin `dryRun`.
4. **Reintentos.** Mandar siempre un `Idempotency-Key` estable por carga, por ejemplo `precios-2026-10-23-lista-a`. Si n8n reintenta, la API no aplica dos veces.
5. **Lotes.** Partir en tandas de 500 como máximo y respetar `429` y `Retry-After`.
6. **Sincronizar.** Para leer cambios, guardar la fecha de la última corrida y pedir `GET /products?updatedSince=<fecha>&pageSize=200`, recorriendo `page`.

Ejemplo, aumento del 10% en stickers redondeado a pesos (primero simulado):

```http
POST /api/admin/v1/prices/bulk-update
Authorization: Bearer sk_sublime_…
Content-Type: application/json
Idempotency-Key: aumento-stickers-2026-10

{ "rule": { "type": "percent", "value": 10 }, "scope": { "categoryId": "stickers" }, "rounding": "nearest_100", "dryRun": true }
```

## Verificación (23/10/2026)

- **Tests:**
  - `tests/admin-api.test.mjs` (21) cubre: contrato, entorno sin base, claves faltantes, inválidas, con secreto incorrecto y revocadas, permisos, límite por minuto, 404 y 405, filtros y parámetros desconocidos, detalle con imágenes, `updatedSince`, alta auditada como integración, campos desconocidos y duplicados, `PATCH` parcial, baja, formato del cuerpo, upsert masivo con y sin simulación, precios exactos y por regla, productos a pedido omitidos, conteos con reservas y nota obligatoria, e idempotencia.
  - Total del proyecto: 162 tests.
- **De punta a punta contra staging, con una clave temporal `e2e-prueba-local` ya revocada:**
  - contrato `200`;
  - sin clave `401`;
  - listado y detalle;
  - alta sin permiso `403`;
  - simulación de +10% en packs (5 productos, ej. `SUB-P08` 890000 → 979000);
  - simulación de conteo de stock;
  - clave revocada `401`.
  - No se modificó ningún dato.

## Próximas versiones del estándar (todavía sin implementar)

| Tema | Plan |
| --- | --- |
| Importaciones grandes (CSV) | `POST /imports` en segundo plano, con estado, resultado por fila y plantillas CSV oficiales para productos, precios y stock. Antes de aplicar, rama de respaldo en Neon. |
| Imágenes por API | `POST /products/{sku}/images`, por archivo o por URL. Las URLs se aceptan solo de dominios permitidos y nunca de direcciones internas (protección contra SSRF). La validación es la misma que en el panel. |
| Promociones | Modelo propio con vigencia y alcance. Se diseña junto con los pedidos (Fase 4). |
| Webhooks salientes | Avisos firmados (`product.updated`, `stock.low`) si alguna integración los necesita. |

### Notas para quien integre (ya no condicionan el diseño)

- **Origen de precios y stock:** el sistema de origen (planilla, ERP) se mapea a estos endpoints. La API no depende de dónde vengan los datos.
- **Formato:** hoy JSON. Para CSV conviene esperar `/imports`, o convertirlo en el flujo.
- **Imágenes:** hasta tener el endpoint, se cargan desde el panel.
