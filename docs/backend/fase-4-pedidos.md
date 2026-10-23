# Fase 4 — Carrito en el servidor, reservas de stock y pedidos

Estado: **activa en staging** (migración 0008 aplicada el 23/10/2026). En producción el checkout sigue siendo la simulación, porque no hay base.

Corresponde a la fila 4 del roadmap técnico (`docs/auditoria-tecnica-backend-v1.1.md`):

> Recalcular en el servidor, guardar una foto de cada pedido y reservar el stock 15 minutos con vencimiento.
> **Aceptación:** prueba concurrente sin doble venta; vencimiento y reintentos comprobados.

## Flujo

1. **Carrito** (navegador): guarda solo ids, SKUs de variante y cantidades.
2. **Checkout** (`/checkout`):
   - pide los datos de contacto, que se completan solos si hay sesión;
   - entrega: **retiro** o **envío**, con las direcciones guardadas o una nueva;
   - comentarios opcionales.
3. **Confirmar pedido**: el servidor, en `src/server/orders/checkout.ts`:
   1. libera las reservas vencidas;
   2. **recalcula el carrito** con los precios y el stock vigentes (no confía en el navegador);
   3. crea el pedido en estado **pendiente de pago**, guarda una **foto** de cada línea (nombre, variante, SKU, precio) y **reserva el stock por 15 minutos**. Todo en una sola sentencia SQL.
4. **Confirmación** (`/pedido/<id>?t=<clave>`):
   - muestra el número (SUB-1001…), el detalle y hasta qué hora está reservado el stock (hora de Argentina);
   - el carrito del navegador se vacía;
   - la página es privada: hace falta la clave del enlace o ser el cliente dueño del pedido. Para cualquier otra persona, "no existe".
5. **Pago:** todavía **sin cobro online** (Mercado Pago es la Fase 5 y necesita aprobación). Se coordina por fuera y el admin lo confirma en `/admin/pedidos`.

## Estados

| Estado | Significa | Cómo se llega |
| --- | --- | --- |
| Pendiente de pago | Stock reservado, a la espera del pago | Al confirmar el checkout |
| Pago confirmado | La reserva pasó a **venta**: baja el stock en depósito y el reservado | El admin confirma el pago a tiempo |
| Entregado | Pedido cumplido | El admin, desde "Pago confirmado" |
| Vencido | Pasaron 15 minutos sin pago: el stock se **liberó** | Automático |
| En revisión | Pago recibido tarde y **sin stock suficiente**: se define reposición, demora o devolución | El admin confirma un pago tardío |
| Cancelado | Pedido sin pago cancelado; el stock reservado se libera | El admin, con nota obligatoria |

- **Pago tardío** (pedido vencido): si todavía hay stock libre, se toma y el pedido pasa a "Pago confirmado". Si no hay, pasa a "En revisión". **Nunca se toca stock ya prometido a otro pedido.**
- **Cancelar** es posible desde "pendiente", "vencido" o "en revisión". Un pedido pagado no se cancela desde el panel, porque implica una devolución (política pendiente).
- **Historial:** cada cambio queda en `order_events` con quién lo hizo, cuándo y la nota.

## Garantías técnicas

- **Sin sobreventa:**
  - la regla `reserved <= on_hand` de la tabla de inventario hace fallar **todo** el pedido si alguna línea no tiene stock, aunque haya compras simultáneas;
  - una variante sin fila de inventario se trata como sin stock;
  - un pedido con una línea sin stock no reserva nada de las demás.
- **Reintentos:** cada checkout lleva una clave única generada en el navegador. Si se envía dos veces (doble clic, red lenta), se devuelve el mismo pedido y el stock se reserva una sola vez.
- **Vencimiento sin depender de tareas programadas** (en el plan Hobby, Vercel corre crons solo una vez por día y solo en producción): las reservas vencidas se liberan antes de cada checkout, de cada cálculo del carrito (`/api/cart/quote`), al abrir un pedido y al entrar a `/admin/pedidos`. La operación es segura aunque corra varias veces a la vez.
- **Movimientos de stock:** cada reserva, liberación, vencimiento y venta queda en `inventory_movements`.
- **Foto del pedido:** los cambios posteriores de precio o nombre no alteran pedidos ya hechos.
- **Envío:** el costo queda "A confirmar". Las reglas de envío por zona son la Fase 6.

## Pantallas

| Dónde | Qué |
| --- | --- |
| `/carrito` | En staging, "Ir al checkout" lleva al checkout real. |
| `/checkout` | En staging, el formulario real. En producción, la simulación de siempre. |
| `/pedido/<id>` | Confirmación y seguimiento, con la clave del enlace o la sesión del cliente. |
| `/cuenta` | Nueva sección "Mis pedidos". |
| `/admin/pedidos` | Pestañas por estado con cantidades; aviso de pedidos que vencieron. |
| `/admin/pedidos/<id>` | Detalle, contacto, acciones (confirmar pago, pago tardío, cancelar, entregar) con nota, e historial. |

## Base de datos (0008)

- `orders`: número correlativo, clave secreta del enlace, cliente (opcional), contacto, entrega (JSON), estado, subtotal, envío (vacío hasta la Fase 6), comentarios, clave anti doble envío y vencimiento.
- `order_items`: foto de cada línea. La base controla que subtotal = precio × cantidad.
- `order_events`: historial de estados.
- `stock_reservations.order_id`: vincula las reservas al pedido. Las reservas ya existían desde la 0001.

## Pruebas

- `tests/orders.test.mjs` (14):
  - checkout: formulario, dirección argentina con sus propias indicaciones de entrega, rechazo de campos inyectados;
  - reservas: reserva y foto de precios, **las últimas unidades van a un solo pedido**, todo o nada, mismo pedido ante un reintento;
  - pago: pago a tiempo convertido en venta, vencimiento a los 15 minutos (repetirlo no cambia nada), pago tardío con y sin stock (no toca stock ajeno);
  - cancelación, movimientos de stock, acceso solo con clave y variante obligatoria.
- Total del proyecto: **197 tests**. Lint, typecheck y los dos builds OK.
- **Concurrencia real contra Neon (staging, 23/10/2026):**
  - producto de prueba con 3 unidades y **10 pedidos simultáneos** de 1 unidad;
  - resultado: **3 aceptados, 7 rechazados por stock, 0 errores**; el stock quedó en 3 en depósito y 3 reservadas;
  - limpieza: los 3 pedidos se cancelaron (el reservado volvió a 0) y el producto "PRUEBA concurrencia (borrar)" quedó archivado.
- **Local contra staging:**
  - el checkout real carga y el cálculo del carrito responde;
  - un pedido sin clave muestra "no existe", sin datos.

## Decisiones pendientes (del documento técnico)

- **Plazo de reserva para pagos por transferencia:** 15 minutos sirve para pagos online (Fase 5), pero es corto si se coordina una transferencia. El valor está en `RESERVATION_MINUTES` (`src/server/orders/repository.ts`) y se puede ajustar cuando se defina la política.
- **Devoluciones y cancelación de pedidos pagados:** falta definir la política.
- **Emails de confirmación al cliente:** requieren un proveedor de email, que necesita aprobación.
- **Costo de envío:** Fase 6.

**Pendiente de probar en la preview:** comprar como invitado y con cuenta, ver "Mis pedidos", confirmar el pago desde el panel, dejar vencer un pedido y cancelar otro.
