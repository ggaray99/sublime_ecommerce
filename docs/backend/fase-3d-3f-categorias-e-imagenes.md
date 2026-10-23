# Fase 3D y 3F — Categorías e imágenes

Estado:
- **3D (categorías): activa en staging.** La migración 0005 está aplicada desde el 23/10/2026.
- **3F (imágenes): activa en la preview.** El store de Vercel Blob quedó conectado a Preview y Development el 23/10/2026.

Producción no cambia: sin base de datos sigue con el catálogo fijo, y Blob está apagado ahí por código.

## 3D · Categorías

| Pantalla | Qué se puede hacer |
| --- | --- |
| `/admin/categorias` | Ver todas las categorías con su imagen, cantidad de productos (publicados y totales) y orden. Crear una nueva. |
| `/admin/categorias/[id]` | Editar nombre, bajada, descripción, orden y visibilidad. Reemplazar la imagen. Eliminar (solo si está vacía). Ver su historial. |

Reglas:
- **Identificador:** es la clave pública que va en `/tienda?categoria=…`. Se genera desde el nombre (ej.: "Llaveros y Pines" → `llaveros-y-pines`) y **no se puede cambiar** después, para no romper enlaces.
- **Ocultar en lugar de borrar:** desmarcar "Visible en la tienda" saca de la tienda la categoría **y todos sus productos**. Los productos conservan su estado, así que al volver a mostrarla reaparecen.
- **Eliminar:** solo si no tiene productos en ningún estado. Si tiene, primero hay que moverlos a otra categoría. La base lo impide además por clave foránea.
- **Origen de la tienda:**
  - inicio, tienda (chips y filtro), página de categorías y pie de página leen las categorías visibles desde la base, ordenadas por "Orden" y nombre;
  - cada producto trae el nombre de su categoría.
- **Formulario de productos:** la categoría se elige entre las de la base; las ocultas aparecen marcadas "(oculta)". Si alguien manda una categoría inexistente, la base la rechaza y se muestra "La categoría elegida no existe."

## 3F · Imágenes (Vercel Blob)

**Almacenamiento:**
- Store público `sublime-staging-images` (`store_YhNSqnzTcWoSKzb6`), en la región gru1 (São Paulo).
- Creado y conectado a **Preview y Development** (no Production) el 23/10/2026.
- Es público porque las fotos de la tienda se ven sin login.

**En la edición de producto, sección "Imágenes":**
- Subir una imagen con su texto alternativo, que es obligatorio.
- Elegir cuál es la portada, la imagen que se ve en las tarjetas.
- Subir o bajar cada imagen en el orden.
- Editar el texto alternativo.
- Quitar una imagen.
- Hasta 12 imágenes por producto.

**En la categoría:** reemplazar su imagen. La anterior se borra si se había subido desde el panel.

**Validación, siempre en el servidor:**
- **Tipo real:** se lee de los bytes del archivo (JPEG, PNG o WebP), no de la extensión ni de lo que diga el navegador. Un SVG, un GIF o un texto renombrado se rechazan.
- **Tamaño:** hasta 4 MB. Vercel acepta como máximo 4,5 MB por pedido, y el resto queda para los datos del formulario.
- **Medidas:** entre 400 y 4000 px por lado. Se leen del encabezado de la imagen, sin decodificarla.
- Cada archivo se guarda con un nombre aleatorio (`productos/<id>/imagen-<aleatorio>.webp`) y caché de un año: un archivo nuevo siempre tiene una URL nueva.

**Consistencia:**
- Si falla el registro en la base, el archivo recién subido se borra.
- Al quitar una imagen se borra el registro, y después el archivo, solo si es de Blob. Las imágenes originales del catálogo (`/demo/...`) nunca se borran del proyecto.
- Si el borrado del archivo falla, queda anotado en el log y no rompe la operación.

**Base de datos (0005):**
- `product_images` guarda `pathname`, tipo, ancho, alto y peso de lo subido.
- La unicidad de la posición se verifica al confirmar la transacción. Así, reordenar es una sola sentencia que intercambia posiciones.

**Protección de producción:** `hasBlobStorage()` está apagado en `VERCEL_ENV=production` salvo `SUBLIME_BLOB_IN_PRODUCTION=enabled`, igual que la base y las cuentas.

**Next.js:**
- `images.remotePatterns` habilita `*.public.blob.vercel-storage.com`.
- Las acciones de servidor aceptan hasta 4,4 MB (`experimental.serverActions.bodySizeLimit`).

### Conectar el store (lo hace una persona con acceso)

1. Vercel → **Storage** → `sublime-staging-images` → **Connect Project** → `sublime-ecommerce`.
2. Entornos: **solo Preview y Development**, no Production.
3. Esto crea `BLOB_STORE_ID` (no un token): en Vercel el SDK se autentica con el token OIDC de corta duración de cada función. Para probar en local hace falta `BLOB_STORE_ID` más `VERCEL_OIDC_TOKEN` (lo trae `vercel env pull` y vence en horas) o un `BLOB_READ_WRITE_TOKEN` clásico en `.env.local`.
4. Volver a desplegar la rama para que la preview tome la variable.

## Auditoría

Quedan registrados:
- en productos: `image.add`, `image.alt`, `image.move` e `image.remove`;
- en categorías: `category.create`, `category.update` (solo los campos que cambiaron), `category.image` y `category.delete`.

El historial de cada producto y de cada categoría los muestra en lenguaje simple.

## Pruebas

- `tests/image-file.test.mjs` (10):
  - JPEG, PNG y WebP reales, generados con sharp, incluidos WebP sin pérdida o con transparencia y JPEG progresivo;
  - rechazo de SVG, GIF, archivos vacíos, demasiado chicos o grandes y truncados;
  - protección de producción y detección de URLs de Blob.
- `tests/catalog-admin.test.mjs` (15), sobre PostgreSQL con todas las migraciones y seeds:
  - crear categoría y mover un producto a ella;
  - categoría inexistente rechazada;
  - identificador duplicado;
  - ocultar una categoría oculta sus productos;
  - eliminar solo si está vacía;
  - cambio de imagen de categoría;
  - subir, usar como portada (la tienda la usa como primera), texto alternativo y quitar sin dejar huecos;
  - tope de 12 imágenes;
  - ids de otro producto o maliciosos rechazados.
- `tests/storefront-db.test.mjs`: las categorías de la base son idénticas a las fijas, en el mismo orden.
- Total del proyecto: **132 tests**. Lint, typecheck y los dos builds (staging y simulando producción) OK.
- **Local contra staging:** inicio, tienda, categorías, ficha y carrito responden, y las categorías salen de la base.

**Pendiente:**
- Conectar Blob y probar en la preview: subir una foto, ponerla de portada y verla en la tienda.
- Crear una categoría, asignarle un producto y ocultarla.
