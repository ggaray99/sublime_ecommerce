# API de administración v1 — borrador para revisión

Estado: **propuesta, sin implementar.** Este documento define el contrato antes de programarlo, para que lo revise quien arme los flujos de automatización (n8n, scripts, ERP). Las reglas de negocio ya existen y las usa el panel `/admin`: la API va a usar exactamente las mismas, en `src/server/admin/validation.ts` y `src/server/admin/repository.ts`.

## Principios

- **Base:** `/api/admin/v1`. JSON en UTF-8. Un cambio que rompa el contrato crea una `v2`; `v1` sigue funcionando mientras se migra.
- **Autenticación:** encabezado `Authorization: Bearer <api-key>`.
  - Hay una clave por integración, por ejemplo "n8n-precios".
  - Se muestra una sola vez al crearla.
  - En la base se guarda solo su hash.
  - Se puede revocar y queda registro del último uso.
- **Permisos por clave (scopes):** `catalog:read`, `catalog:write`, `stock:write`, `prices:write`, `images:write`.
  - Una clave sin el permiso necesario recibe `403`.
- **Auditoría:** todo cambio queda en `audit_logs` con actor `integration:<nombre-de-la-clave>`, igual que los cambios del panel.
- **Idempotencia:** toda escritura acepta el encabezado `Idempotency-Key`, de 8 a 120 caracteres.
  - Reenviar la misma clave con el mismo cuerpo devuelve la respuesta original sin aplicar nada de nuevo.
  - Reenviarla con otro cuerpo devuelve `409`.
- **Identificación de productos:** por `sku`, que es estable y legible.
  - También se acepta `id`, el id público (`p13`, `c088`, `x1a2b3c4d`).
  - Las altas y modificaciones masivas buscan por `sku`.
- **Dinero:** siempre `priceMinor`, en centavos enteros, con `currency: "ARS"`. Nunca decimales.
- **Bajas:** archivar (`status: "archived"`), nunca borrar, porque los pedidos e historiales referencian el producto.
- **Límites:**
  - 120 pedidos por minuto por clave; al superarlo, `429` con `Retry-After`.
  - Lotes de hasta 500 ítems por pedido. Para más, importación en segundo plano.
- **Errores:** siempre con esta forma:

```json
{
  "error": "validation_failed",
  "message": "Revisá los datos enviados.",
  "fields": [{ "path": "items[3].priceMinor", "message": "El precio debe ser mayor a $ 0 y hasta $ 10.000.000." }]
}
```

| HTTP | `error` | Cuándo |
| --- | --- | --- |
| 400 | `bad_request` | JSON inválido |
| 401 | `unauthorized` | Falta la clave o es inválida o revocada |
| 403 | `forbidden` | La clave no tiene el permiso necesario |
| 404 | `not_found` | El producto o recurso no existe |
| 409 | `conflict` | Slug, SKU o código duplicado; o `Idempotency-Key` reutilizada con otro cuerpo |
| 413 | `payload_too_large` | Más de 500 ítems o más de 1 MB |
| 415 | `unsupported_media_type` | No es `application/json` (salvo imágenes) |
| 422 | `validation_failed` | Datos con formato correcto pero inválidos |
| 429 | `rate_limited` | Superó el límite de pedidos |

## Recurso producto

```json
{
  "id": "c088",
  "sku": "STK-088",
  "slug": "sticker-088",
  "name": "Sticker 088",
  "description": "…",
  "categoryId": "stickers",
  "theme": "argentina",
  "tags": ["mendoza"],
  "details": ["Vinilo laminado"],
  "featured": false,
  "catalogCode": "088",
  "requiresQuote": false,
  "status": "active",
  "priceMinor": 150000,
  "currency": "ARS",
  "stock": { "tracked": true, "onHand": 20, "reserved": 2, "available": 18 },
  "images": [{ "id": "…", "url": "https://…", "alt": "…", "position": 0 }],
  "updatedAt": "2026-10-23T13:03:43Z"
}
```

Reglas iguales a las del panel:
- **Nombre:** de 1 a 120 caracteres.
- **Slug:** en minúsculas, con números y guiones. Si se omite en el alta, se genera desde el nombre.
- **Descripción:** hasta 2000 caracteres.
- **Etiquetas:** hasta 20, de 30 caracteres como máximo.
- **Detalles:** hasta 12 líneas, de 200 caracteres como máximo.
- **Código de catálogo:** de 3 a 6 dígitos.
- **Precio:** entre 1 centavo y $ 10.000.000. Los productos a pedido no llevan precio ni stock.

## Endpoints

### Catálogo

| Método y ruta | Permiso | Qué hace |
| --- | --- | --- |
| `GET /products?status=&categoryId=&q=&updatedSince=&cursor=&limit=` | `catalog:read` | Lista paginada por cursor, hasta 200 por página. `updatedSince` permite sincronizaciones incrementales. |
| `GET /products/{sku}` | `catalog:read` | Un producto. |
| `POST /products` | `catalog:write` | Alta de un producto. Nace en `draft` salvo que se indique otro estado. `initialStock` opcional. Responde `201`. |
| `PATCH /products/{sku}` | `catalog:write` | Modifica los campos enviados; los omitidos no se tocan. |
| `POST /products/{sku}/archive` | `catalog:write` | Baja lógica. |
| `GET /categories` | `catalog:read` | Categorías. Su alta y edición llegan con el paso 2. |

### Operaciones masivas

Todas aceptan `"dryRun": true`. En ese modo validan y devuelven el resultado que tendrían, sin guardar nada. Se aplican **por ítem**: un ítem inválido no frena a los demás. La respuesta trae el resultado de cada uno:

```json
{
  "dryRun": false,
  "summary": { "created": 10, "updated": 85, "unchanged": 4, "failed": 1 },
  "items": [
    { "index": 0, "sku": "STK-088", "result": "updated", "changes": ["priceMinor"] },
    { "index": 7, "sku": "STK-999", "result": "failed", "error": { "error": "validation_failed", "fields": [ … ] } }
  ]
}
```

| Método y ruta | Permiso | Qué hace |
| --- | --- | --- |
| `POST /products/bulk-upsert` | `catalog:write` | Hasta 500 productos. Si el `sku` existe, actualiza los campos enviados; si no, lo crea. |
| `POST /products/bulk-archive` | `catalog:write` | `{ "skus": [ … ] }`: baja masiva. |
| `POST /prices/bulk-update` | `prices:write` | Precio exacto por SKU (`[{ "sku", "priceMinor" }]`) o ajuste por regla. Las dos formas se detallan abajo. |
| `POST /stock/bulk-count` | `stock:write` | Conteos por SKU (`[{ "sku", "onHand", "reason", "note" }]`). Mismas reglas que el panel: no puede quedar por debajo de lo reservado y los ajustes requieren nota. |

Ajuste de precios por regla:

```json
{
  "rule": { "type": "percent", "value": 12.5 },
  "scope": { "categoryId": "stickers" },
  "rounding": "nearest_100",
  "dryRun": true
}
```

- `type`: `percent` (porcentaje) o `amount` (monto en centavos, positivo o negativo).
- `scope`: categoría, lista de SKUs, o `all` (todo el catálogo).
- `rounding`: `none`, `nearest_100` (a $1) o `nearest_1000` (a $10).
- Nunca puede dejar un precio en $0 o menos. Los productos a pedido se ignoran.

### Importaciones grandes (en segundo plano)

Para más de 500 ítems o para archivos CSV:

| Método y ruta | Qué hace |
| --- | --- |
| `POST /imports` | Recibe un CSV o JSON con `kind`: `products`, `prices` o `stock`, más `dryRun`. Responde `202` con `{ "id", "status": "queued" }`. |
| `GET /imports/{id}` | Estado (`queued`, `running`, `completed`, `failed`), progreso y resumen. |
| `GET /imports/{id}/results` | Resultado de cada fila, para descargar los errores y corregirlos. |

Antes de aplicar una importación grande (no en simulación) se crea una rama de respaldo de la base en Neon.

### Imágenes (requiere aprobar Vercel Blob)

| Método y ruta | Qué hace |
| --- | --- |
| `POST /products/{sku}/images` | Sube un archivo (`multipart/form-data`) **o** importa desde una URL (`{ "sourceUrl", "alt" }`). |
| `PATCH /products/{sku}/images/{imageId}` | Cambia el texto alternativo o la posición. La posición 0 es la portada. |
| `DELETE /products/{sku}/images/{imageId}` | Quita la imagen del producto. |

Validación:
- **Formatos:** JPEG, PNG o WebP. Se verifica por el contenido real del archivo, no por la extensión.
- **Tamaño:** hasta 8 MB y entre 400 y 4000 px por lado.
- **Texto alternativo:** obligatorio.
- **URLs externas:** solo de dominios configurados como permitidos. Se rechazan direcciones privadas o internas, con un tiempo máximo y un tamaño máximo de descarga. Esto evita que alguien use el servidor para pedir direcciones de la red interna (SSRF).

### Promociones (después de pedidos)

Son un modelo aparte del precio base: `POST/GET/PATCH /promotions`, con `startsAt`, `endsAt`, alcance (SKUs, categorías o todo) y descuento (porcentaje o monto). El precio base no se modifica y la promoción vence sola. Se diseña junto con los pedidos, porque el descuento se tiene que guardar en cada pedido.

## Webhooks salientes (opcional, a confirmar)

Avisos a n8n cuando algo cambia, por ejemplo `product.updated`, `stock.low` o `import.completed`. Van firmados con HMAC y se reintentan si fallan.

## Preguntas para revisar

1. ¿Qué sistema es la fuente de verdad de precios y stock? Por ejemplo, ¿un Excel o un ERP que n8n lee?
2. ¿Las integraciones necesitan crear productos, o solo actualizar precio y stock de los existentes?
3. ¿El formato de importación preferido es CSV (con qué columnas) o JSON?
4. ¿Qué dominios de imágenes deberían permitirse? Por ejemplo, Google Drive o el sitio del proveedor.
5. ¿Hacen falta webhooks salientes desde el comienzo?
