# Plan para pasar el backend a producción

Estado al 23/10/2026: todo lo construido (Fases 1 a 4 y 6, más la API de integraciones) funciona en **staging/previews** sobre la rama `feat/backend-fundaciones`. **Producción** (`main`, sublime-ecommerce.vercel.app) sigue con el catálogo fijo y el checkout simulado. El código de las fases 1 a 3A ya está ahí, pero inactivo, porque producción no tiene base, cuentas ni imágenes conectadas.

El plan está pensado para que **cada paso se pueda deshacer** y para que nada cambie para el público hasta el último interruptor.

---

## Etapa 0 · Decisiones y requisitos (bloquean el lanzamiento)

| # | Tema | Por qué bloquea | Responsable |
| --- | --- | --- | --- |
| 0.1 | **Plan Vercel Pro** | El plan Hobby es solo para uso personal y no comercial (lo dicen las condiciones de uso de Vercel). Una tienda que vende necesita Pro (USD 20 por usuario por mes). Además, Pro guarda los logs 1 día en vez de 1 hora. | Negocio |
| 0.2 | **Base de producción en Neon con plan pago** | El plan gratis permite volver atrás solo 6 horas. Para una tienda con pedidos hace falta una ventana de restauración de días. | Negocio |
| 0.3 | **¿Se abre la venta sin pago online?** | Hoy el pedido queda "pendiente de pago" y se coordina por fuera. Hay que elegir entre lanzar así (decidir el plazo de reserva, pendiente 4.2) o esperar la Fase 5 (Mercado Pago, que requiere aprobación). | Negocio |
| 0.4 | **Requisitos legales de venta online en Argentina** | A validar con asesoría legal: términos y condiciones; política de privacidad (Ley 25.326); datos del vendedor (razón social, CUIT); **botón de arrepentimiento** (Res. 424/2020); política de cambios y devoluciones; facturación. | Negocio con asesoría |
| 0.5 | **Emails al cliente** (confirmación, pago, envío) y recuperación de contraseña | Sin email, el cliente solo tiene el enlace del pedido. Hace falta aprobar un proveedor (ej.: Resend por el Marketplace de Vercel). | Negocio aprueba |
| 0.6 | **Datos reales**: catálogo, precios, stock contado, fotos, reglas de envío y punto de retiro | Hoy todo es demo. El seed de staging carga 20 unidades de ejemplo por producto y reglas de envío demo: **no se usan en producción.** | Negocio |
| 0.7 | **Dominio propio** (ej.: sublime.com.ar) | Las cuentas (Neon Auth) necesitan el dominio definitivo en su lista de dominios permitidos. | Negocio |

## Etapa 1 · Preparar el código (en la rama, sin tocar producción)

| # | Cambio | Detalle |
| --- | --- | --- |
| 1.1 | **Interruptores separados** | Hoy, con la base activa, se activa todo junto: panel, tienda leyendo de la base y checkout real. Separar en tres variables: `SUBLIME_DB_IN_PRODUCTION` (panel, carga de datos y API), `SUBLIME_STORE_FROM_DB` (la tienda lee de la base) y `SUBLIME_ORDERS_ENABLED` (checkout real). Así se cargan los datos sin que el público vea nada a medias. |
| 1.2 | **Migraciones en producción** | El script de migraciones hoy solo admite staging y bloquea producción, a propósito. Agregar un modo de producción con confirmación explícita (nombre de la base) y que exija un respaldo previo. Los seeds de staging (stock 20 y envíos demo) quedan prohibidos en producción. |
| 1.3 | **Carga inicial del catálogo** | Script o importación por API (`/products/bulk-upsert` y `/stock/bulk-count`) con los datos reales. El stock inicial sale de un conteo físico. |
| 1.4 | **Textos "demo"** | Quitar las etiquetas "demo" o "precio demo" y los avisos de "entorno de prueba" del sitio público, y revisar el pie con los datos legales (0.4). |
| 1.5 | **Revisión de seguridad** | Revisar sesiones, permisos del panel y la API, encabezados de seguridad y límites. Activar la protección contra bots del firewall de Vercel en checkout y registro. |
| 1.6 | **Emails** | Si se aprueba 0.5: confirmación del pedido, pago confirmado, enviado, y recuperación de contraseña. |
| 1.7 | **Pull request a `main`** | Revisión del PR y merge **con todos los interruptores apagados**: producción sigue igual que hoy (ya se hizo así con las fases 1 a 3A). Antes: tests, lint y build, también simulando producción. |

## Etapa 2 · Infraestructura de producción (separada de staging)

| # | Paso | Detalle |
| --- | --- | --- |
| 2.1 | Pasar el proyecto a **Vercel Pro** | Ver 0.1. |
| 2.2 | **Base de producción** en Neon, nueva y distinta de `sublime-staging` | Desde el Marketplace de Vercel, conectada **solo a Production**, en una región cercana a las funciones. Plan pago con restauración de varios días. |
| 2.3 | **Neon Auth de producción** | Va en la base de producción. Agregar el dominio definitivo a sus dominios permitidos (lo que aprendimos en staging). Cargar `NEON_AUTH_COOKIE_SECRET` como Secret, solo en Production. |
| 2.4 | **Almacenamiento de imágenes de producción** | Un store de Vercel Blob nuevo, conectado **solo a Production**. |
| 2.5 | **Dominio** | Configurar el dominio propio en Vercel y en Neon Auth. |
| 2.6 | Verificar las variables | Production tiene la base, las cuentas y el Blob de producción. Preview y Development siguen apuntando a staging. Ninguna mezcla. |

## Etapa 3 · Base y datos (el público todavía no ve cambios)

| # | Paso | Detalle |
| --- | --- | --- |
| 3.1 | **Respaldo** y migraciones 0001 a 0009 en la base de producción | Con el modo de producción de 1.2. Sin seeds de demo. |
| 3.2 | Activar **solo** `SUBLIME_DB_IN_PRODUCTION`, `SUBLIME_AUTH_IN_PRODUCTION` y `SUBLIME_BLOB_IN_PRODUCTION`, y redesplegar | Habilita el panel y la API. La tienda sigue con el catálogo fijo (1.1). |
| 3.3 | Crear al **dueño** del panel | Registrarse en el sitio, abrir "Mi cuenta" y otorgar el rol con `admin:grant` en modo producción. |
| 3.4 | **Cargar los datos reales** | Categorías, productos, precios, variantes, stock contado, fotos, reglas de envío y retiro. Por el panel o por la API (claves de integración en `/admin/integraciones`). |
| 3.5 | **Revisión interna** | Recorrer todo el panel y comparar con el catálogo real. |

## Etapa 4 · Activación gradual

| # | Paso | Cómo se deshace |
| --- | --- | --- |
| 4.1 | Activar `SUBLIME_STORE_FROM_DB` y redesplegar: la tienda muestra el catálogo real | Apagar el interruptor y redesplegar: vuelve el catálogo fijo. |
| 4.2 | Revisar la tienda: precios, stock, fotos, filtros, talles | Igual que 4.1. |
| 4.3 | Activar `SUBLIME_ORDERS_ENABLED` | Apagarlo: vuelve el checkout simulado. Los pedidos ya hechos quedan en la base. |
| 4.4 | **Pedido de prueba interno** con retiro y con envío: confirmar pago, enviar, entregar. Después cancelar otro y verificar que el stock vuelve | — |
| 4.5 | **Lanzamiento**: comunicarlo | — |

**Ante una falla grave en cualquier momento**, de menor a mayor impacto:
1. Apagar el interruptor de esa etapa y redesplegar (minutos).
2. "Instant Rollback" de Vercel al deploy anterior.
3. Restaurar la base de Neon a un momento previo, con la ventana del plan pago. Procedimiento en [backup-y-rollback.md](backup-y-rollback.md).

## Etapa 5 · Operación

- **Diaria:**
  - revisar `/admin/pedidos` (pendientes, en revisión);
  - confirmar pagos y cargar los seguimientos.
- **Monitoreo:**
  - errores y logs en Vercel (Pro: 1 día de logs);
  - alertas de uso y gasto;
  - opcional: enviar los logs a un servicio externo.
- **Respaldos:** antes de cada migración o importación grande, crear una rama de respaldo en Neon.
- **Accesos:**
  - revisar quién es dueño o editor del panel;
  - revisar las claves de API activas y revocar las que no se usen.
- **Después del lanzamiento:**
  - Fase 5 (pago online);
  - emails, si no entraron antes;
  - importación de CSV y promociones.

---

## Resumen de esfuerzo estimado (desarrollo)

| Etapa | Estimación |
| --- | --- |
| 1 · Preparar el código (sin emails ni pagos) | 2 a 4 días |
| 1.6 · Emails (si se aprueban) | 1 a 2 días |
| 2 · Infraestructura | medio día (con las cuentas pagas ya listas) |
| 3 y 4 · Migración, carga asistida y activación | 1 a 2 días, más el tiempo del negocio para cargar los datos |

Las decisiones de la etapa 0 (plan Pro, base paga, legales, pago online, datos reales) definen la fecha. Técnicamente, la rama está lista para la etapa 1.
