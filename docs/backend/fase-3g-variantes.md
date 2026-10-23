# Fase 3G — Variantes (talles, colores…)

Estado: **activa en staging** (migración 0007 aplicada el 23/10/2026). Producción sigue con el catálogo fijo, sin variantes.

## Modelo

- Un producto puede tener **hasta 2 opciones** (ej.: Talle: S, M, L, XL; Color: Negro, Blanco) y **hasta 30 combinaciones**.
- Cada combinación es una **variante** con SKU, precio, stock e indicación de si está activa. La tabla `product_variants` ya existía desde la 0001; la 0007 agrega `products.option_names`, el orden de las variantes y una restricción para que no se repita una combinación dentro de un producto.
- **Las variantes nunca se borran, se desactivan**, porque los movimientos de stock (y más adelante los pedidos) las referencian.
- Los productos sin opciones siguen igual: una sola variante, la principal.

## Cómo se definen

En la edición del producto, sección **Variantes**, se completan Opción 1, sus valores, y opcionalmente Opción 2 con los suyos. Al guardar, el sistema arma una variante por combinación (`src/server/admin/variants.ts` → `planVariants`):

| Situación | Qué pasa |
| --- | --- |
| Primera vez | La variante original toma la primera combinación y **conserva su SKU y su stock**. Las demás se crean con SKU generado (ej.: `SUB-P13-M`, `SUB-P13-XL-NEGRO`), el precio actual y stock 0. |
| Se agrega un valor (XL) | Se crea solo esa combinación. |
| Se quita un valor (L) | Sus variantes se **desactivan**: desaparecen de la tienda y se conservan en la base con su historial. Si se vuelve a agregar, se reactivan. |
| Se renombra una opción (Talle → Tamaño) | Se conservan los valores según la posición. |
| Se agrega una segunda opción (Color) | Las variantes existentes toman el primer color, así conservan SKU y stock; se crean las combinaciones restantes. |
| Se quita la segunda opción | Si dos variantes quedan iguales (M-Negro y M-Blanco → M), sigue activa la primera y la otra se desactiva. |

Después, en la tabla de variantes se edita el **precio** y si está **activa** cada combinación. Siempre queda al menos una variante activa; para sacar el producto entero se lo archiva.

**Stock:** el formulario de conteo suma un selector de variante. El stock del producto (listado, filtros y tienda) es la **suma de sus variantes activas**. Cada movimiento registra el SKU contado.

**Precio en la ficha del producto:** con variantes, el campo de precio general se oculta, porque cada variante tiene el suyo.

## En la tienda

- **Ficha del producto:** selectores por opción, que son botones accesibles (radios). Las combinaciones sin stock aparecen tachadas. Se muestran el precio y el stock de la combinación elegida, y "Agregar al carrito" guarda el **SKU** de la variante.
- **Tarjetas:** si los precios varían, muestran "desde $ X". El botón cambia a "Elegir talle" (o la opción que corresponda) y lleva a la ficha.
- **Carrito y checkout:** muestran la opción elegida (ej.: "Talle M") con el precio y el stock de esa variante. Cada combinación es una línea distinta.
- **Cálculo en el servidor (`/api/cart/quote`):**
  - las líneas aceptan `sku`;
  - en un producto con opciones, una línea sin SKU da `variant_required`;
  - un SKU de otro producto da `unknown_product`, nunca se toma como ese otro producto;
  - las líneas de la misma variante se unen.

## API (`/api/admin/v1`)

- `PUT /products/{sku}/options` define las opciones, con las mismas reglas que el panel.
- `GET /products/{sku}` (también con el SKU de una variante) incluye `optionNames` y `variants`. El listado incluye `optionNames` y `variantCount`.
- `POST /prices/bulk-update` y `POST /stock/bulk-count` funcionan **por SKU de variante**. Las reglas de precio se aplican a cada variante activa del alcance.
- En productos con variantes, `priceMinor` a nivel producto (`PATCH`, `bulk-upsert`) se **rechaza** con un mensaje que indica usar el SKU de la variante, para que no haya ambigüedad.

## Pruebas

- `tests/variants.test.mjs` (12):
  - lectura de opciones y casos inválidos (valores repetidos, 64 combinaciones);
  - combinaciones en orden y SKU legibles y únicos;
  - recálculo de variantes en cada situación de la tabla;
  - repositorio: creación, stock por variante y suma, precio y estado con al menos una activa, agregado de color sin perder SKU, búsqueda por SKU y productos a pedido.
- `tests/variants-flow.test.mjs` (9):
  - carrito del navegador con una línea por variante y carritos guardados;
  - opciones por API, precio y stock por SKU de variante, rechazo de precio ambiguo y regla de precio sobre todas las variantes;
  - tienda con precio "desde", stock sumado y variantes inactivas ocultas;
  - cálculo en el servidor con `variant_required`, SKU de otro producto y stock por variante.
- Total del proyecto: **183 tests**. Lint, typecheck y los dos builds OK.
- **Local contra staging:** la tienda, las fichas y el carrito responden. Ningún producto tiene variantes todavía; se definen desde el panel.

**Pendiente de probar en la preview:** definir talles en una remera, cargar stock por talle, elegir un talle en la tienda y verlo en el carrito.
