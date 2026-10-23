# Fase 4 — La tienda lee de la base

Estado: **activo en staging y previews**. Producción no tiene base de datos conectada y sigue mostrando el catálogo fijo, sin cambios visibles.

## Qué cambió

Donde hay base de datos, la tienda toma de ella los datos comerciales y del código el contenido:

| Dato | De dónde sale |
| --- | --- |
| Nombre, descripción, fotos, temática, detalles, código de catálogo | Catálogo fijo (`src/data/products.ts`) |
| **Visibilidad** | Base: solo se muestran los productos **publicados**. Borradores, archivados o productos que no están en la base no aparecen en la tienda, el inicio, las categorías ni el sitemap, y su ficha da 404. |
| **Precio** | Base (`product_variants.price_minor`) |
| **Stock** | Base: disponible = en depósito − reservado |

Efectos visibles:

- **Ficha de producto:** muestra "Stock disponible: N unidades", "Sin stock por ahora" o "Se fabrica a pedido".
- **Producto sin stock:**
  - la ficha reemplaza el botón de compra por un aviso;
  - la tarjeta muestra la etiqueta "Sin stock" y no tiene botón "Agregar al carrito".
- **Carrito y checkout:**
  - usan los precios de la base;
  - si la cantidad pedida supera el stock, el carrito lo avisa en la línea;
  - el cálculo del servidor (`/api/cart/quote`) ya rechazaba esas cantidades desde la Fase 1.
- **Contador de productos de la tienda:** cuenta solo los publicados.

## Cómo funciona

- `src/server/catalog/storefront.ts` → `applyCommercialData()`: función pura que combina el catálogo fijo con las variantes activas y la disponibilidad. Está probada en `tests/storefront.test.mjs`.
- `src/server/storefront.ts` → `getStorefrontProducts()`: la usan la tienda, el inicio, las categorías, el sitemap, la ficha, el carrito y el checkout.
  - Está cacheada con `"use cache"` y la etiqueta `catalog`, así que las páginas siguen siendo estáticas y rápidas.
  - Sin base de datos, devuelve el catálogo fijo.
- **Frescura:** cada cambio de precio, estado o stock hecho en `/admin` llama a `updateTag("catalog")`. La tienda muestra el cambio en la siguiente visita.
  - Si alguien cambia la base por fuera del panel (SQL directo), el cambio aparece como mucho en una hora.
- Se eliminó `src/components/product-availability.tsx`: el stock ahora viene con el catálogo y no hace falta una consulta aparte por ficha.

## Límites conocidos

- **Productos nuevos:** un producto creado solo en la base no aparece, porque fotos y textos siguen en el código. Crear productos desde el panel requiere guardar contenido e imágenes en la base (Fase 6, imágenes, necesita aprobación de almacenamiento).
- **Stock en el carrito:** el carrito guarda solo ids y cantidades en el navegador. Un producto que pasa a borrador desaparece del carrito sin aviso.
- **Reservas:** el stock mostrado no descuenta todavía compras, porque no hay pedidos. Eso llega con la Fase 5 (pedidos y reservas), que también invalidará la caché al vender.

## Verificación (23/10/2026)

- **Pruebas automáticas:** 90 tests, de ellos 5 nuevos de la combinación catálogo + base. Lint y typecheck OK.
- **Build:**
  - con base de staging: inicio y tienda estáticos con revalidación de 1 h;
  - simulando producción (`VERCEL_ENV=production npm run build`): catálogo fijo y caché larga.
- **Local contra staging:**
  - todas las páginas responden 200;
  - la tienda muestra 65 productos, igual que los publicados en la base;
  - la ficha muestra el stock real.
- **Pendiente:** probar en la preview, con sesión de admin, que poner un producto en borrador lo saque de la tienda al instante y que un precio nuevo se vea en la ficha y en el carrito.
