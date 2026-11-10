# Fase 3A — Panel de administración

Estado: **activo en staging** (migración 0003 aplicada el 23/10/2026). Producción no tiene panel: depende de las cuentas, que el código desactiva en `VERCEL_ENV=production`.

## Qué se puede hacer

| Pantalla | Para qué |
| --- | --- |
| `/admin` | Listado de productos con miniatura, categoría, SKU, estado, precio y stock disponible (resalta 5 unidades o menos). **Filtros a la izquierda** (arriba en celular): búsqueda por nombre, SKU, código o etiqueta; estado; categoría; temática; stock (con, bajo, sin, a pedido); imágenes (con o sin fotos); y destacado. El **orden** (nombre, precio, stock, modificados) está arriba, junto a la sesión, y conserva los filtros. Cada opción muestra cuántos productos tiene. Los filtros viajan en la URL (`/admin?categoria=stickers&stock=sin`), se aplican al cambiar y filtra la base; paginado de a 50. Abajo, los últimos 10 cambios. |
| `/admin/productos/[id]` | Cambiar precio y estado (publicado, borrador, archivado). Registrar un conteo de stock con motivo y nota. Ver movimientos de stock e historial de cambios del producto. |
| `/cuenta` | Si la cuenta es de un administrador, muestra el enlace al panel. |
| `/producto/[slug]` | En staging muestra el stock real y el precio de la base (ver Fase 3B). En producción no muestra nada nuevo. |

## Decisiones

| Tema | Decisión |
| --- | --- |
| Quién es admin | Una cuenta de cliente cuyo id de Neon Auth está en la tabla `admin_users`. No hay pantalla para dar permisos: se otorgan con un script. |
| Roles | `owner` (dueño) y `editor`. Hoy ambos pueden editar catálogo y stock. La diferencia queda lista para cuando haya gestión de usuarios. |
| Stock | Se registra como **conteo**: se ingresa cuántas unidades hay y el sistema guarda la diferencia como movimiento (`restock` o `adjustment`). Los ajustes requieren nota. |
| Productos a pedido | No llevan precio fijo ni stock. El panel no permite asignarles ninguno de los dos. |
| Atomicidad | Cada cambio, su movimiento de stock y su registro de auditoría se guardan en una sola sentencia SQL: se guardan juntos o no se guarda nada. |

## Seguridad

- **La autorización está en el servidor.** Cada página y cada acción vuelve a leer la sesión y consulta `admin_users`. Que alguien vea el formulario no lo habilita a enviarlo.
- Doble barrera: `src/proxy.ts` manda a `/cuenta/ingresar` a quien no tiene sesión. Quien tiene sesión pero no es admin recibe un 404, sin pistas de que el panel existe.
- Los ids de producto que llegan del formulario se validan (`^[a-z0-9]{1,20}$`) antes de llegar a SQL. Las búsquedas escapan los comodines de `LIKE`.
- Topes de validación: precio entre $ 0,01 y $ 10.000.000. Stock entero entre 0 y 100.000, nunca menor a las unidades reservadas (también lo impide la base).
- Auditoría de solo agregado (`audit_logs`): quién, qué, cuándo, y los valores antes y después. Guardar sin cambios no genera registro.

## Piezas

| Pieza | Ubicación |
| --- | --- |
| Migración | `db/migrations/0003_admin.sql` (`admin_users`, `audit_logs`) |
| Validación de formularios | `src/server/admin/validation.ts` (precios en formato argentino, conteos) |
| Repositorio | `src/server/admin/repository.ts` |
| Admin actual desde la sesión | `src/server/admin/session.ts` |
| Acciones de servidor | `src/app/admin/actions.ts` |
| Pantallas y componentes | `src/app/admin/*`, `src/components/admin/*` |
| Stock y precio en la tienda | `src/server/storefront.ts` (Fase 3B) |
| Script para dar permisos | `scripts/admin-grant.mjs` |

## Dar acceso a una persona

1. La persona se registra en el sitio de staging y abre `/cuenta` una vez. Así queda vinculada en `customers`.
2. Desde la máquina con `.env.local`:

   ```
   npm run admin:grant -- --email=persona@dominio.com --role=owner
   ```

   El script corre solo contra staging, se niega con `VERCEL_ENV=production` y deja el permiso registrado en `audit_logs`.
3. Para quitar el acceso, por ahora: `DELETE FROM admin_users WHERE email = '…'` en Neon Console → SQL Editor.

Hoy tiene rol `owner` el usuario de prueba `qa.sublime.staging.1022@example.com`.

## Pruebas

`tests/admin.test.mjs` (12 tests):

- Validación de precios ("2.500,50"), estados y conteos.
- Sobre PostgreSQL (PGlite):
  - solo reconoce a quien está en `admin_users`;
  - búsqueda y comodines;
  - auditoría con antes y después, sin registros vacíos;
  - los productos a pedido nunca reciben precio;
  - movimientos de stock;
  - rechazo de conteos por debajo de lo reservado y de productos a pedido;
  - ids maliciosos;
  - restricciones de la base.

Total del proyecto: 85 tests.

Verificación en local contra staging (23/10/2026):

- Migración aplicada.
- Permiso otorgado con el script.
- `/admin` sin sesión redirige a ingresar.
- La ficha de producto muestra "Stock disponible: 20".

**Pendiente de verificar en navegador** el flujo con sesión de admin (editar precio y stock). Las reglas están cubiertas por los tests, pero el recorrido completo en pantalla todavía no se hizo.

## Fuera de alcance (próximas fases)

- **Alta y baja de productos y categorías.** Resuelto para productos en la Fase 3C; categorías, pendiente.
- **Imágenes.** Subirlas requiere un almacenamiento (por ejemplo, Vercel Blob), que necesita aprobación.
- **Variantes** (talles, materiales): el esquema las soporta, pero el panel edita solo la variante por defecto.
- Gestión de administradores desde la web y quitar permisos con script.
