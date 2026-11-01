# Fase 5 · Pagos con Mercado Pago

Los clientes pagan sus pedidos con Mercado Pago (Checkout Pro, **API de Orders**) y el pedido pasa a **Pagado** solo. La cuenta que cobra se conecta desde **Admin → Integraciones → Conectar Mercado Pago**: el dueño inicia sesión en Mercado Pago y autoriza. Nadie copia ni pega claves.

## Cómo funciona

1. **Conectar (una vez).** El dueño toca "Conectar Mercado Pago", inicia sesión con la cuenta que va a recibir el dinero y autoriza. El servidor recibe las credenciales de esa cuenta y las guarda **cifradas** (AES-256-GCM). Se renuevan solas antes de vencer (duran 180 días).
2. **Pagar.** En la página del pedido pendiente aparece "Pagar con Mercado Pago". El cliente paga en Mercado Pago (tarjeta, dinero en cuenta, Mercado Crédito) y vuelve a su pedido. Los datos de la tarjeta nunca pasan por Sublime.
3. **Confirmar.** Mercado Pago avisa al webhook. El servidor verifica la firma, consulta la order de Mercado Pago y, si está pagada (`processed`) por el total exacto del pedido, lo confirma con las mismas reglas que el botón del admin.

| Caso | Qué pasa |
| --- | --- |
| Pagado (`processed`) | El pedido pasa a Pagado; el stock reservado pasa a venta. Historial: "mercadopago". |
| Pendiente / requiere acción / rechazado / vencido | Se registra el intento; el pedido sigue esperando. El cliente puede reintentar. |
| Duplicado (el mismo aviso dos veces o a la vez) | Se confirma una sola vez. |
| Tardío (la reserva ya venció) | Si hay stock, se vende; si no, el pedido queda **En revisión** para decidir reposición, demora o devolución. |
| Monto o moneda distintos | **No se aplica.** Queda registrado en el log del servidor. |
| Pedido cancelado o en revisión | **No se aplica.** Queda en el log: revisar y devolver si corresponde. |
| Segundo pago aprobado para un pedido ya pagado (cobro doble) | **No se aplica.** Queda en el log: devolver uno desde Mercado Pago. |
| Firma inválida | Se rechaza (401) sin consultar nada. |

**Detalles de diseño:**
- **Vencimiento:** la order de Mercado Pago vence con la reserva de stock (15 minutos), redondeando para abajo.
- **Efectivo excluido:** no se ofrecen Rapipago ni Pago Fácil, porque se acreditan en días y la reserva vencería antes.
- **Envío sin costo:** si el envío todavía no tiene costo, no se ofrece el pago online.

## Configuración (una vez por entorno)

### 1. Crear la aplicación en Mercado Pago
En [Tus integraciones](https://www.mercadopago.com.ar/developers/panel/app), crear una aplicación. Admin → Integraciones muestra las dos URLs exactas del entorno:
- **Solución:** Checkout Pro. **Tipo de API: API de Orders.** La API de Preferences es legacy y el panel avisa que se va a discontinuar.
- **URL de redireccionamiento:** `https://<dominio>/api/mercadopago/callback`. Una por entorno; por ejemplo, staging usa `https://staging.sublime.consulte.app/api/mercadopago/callback`.
- **PKCE:** activarlo en la configuración de OAuth. El servidor siempre lo usa.
- **Webhooks → Configurar notificaciones:**
  - URL: `https://<dominio>/api/mercadopago/webhook`.
  - Evento: **Order (Mercado Pago)**. Las notificaciones llegan como `?data.id=ORD…&type=order`.
  - Al guardar se genera la **clave secreta**.

La aplicación puede ser de quien desarrolla, para probar, o del negocio. Antes del lanzamiento conviene que quede a nombre del negocio. Cambiarla es solo cambiar las variables y volver a conectar.

### 2. Variables (`staging.env` / `production.env`)

| Variable | De dónde sale |
| --- | --- |
| `MERCADOPAGO_CLIENT_ID` | Aplicación → Credenciales (Client ID) |
| `MERCADOPAGO_CLIENT_SECRET` | Aplicación → Credenciales (Client Secret) |
| `MERCADOPAGO_WEBHOOK_SECRET` | Aplicación → Webhooks → clave secreta |
| `PAYMENTS_ENCRYPTION_KEY` | `openssl rand -base64 32`. Si cambia, hay que volver a conectar |
| `MERCADOPAGO_ACCESS_TOKEN` | Opcional, **modo directo**: Access Token de la cuenta dueña de la aplicación (en staging, el de la pestaña **Prueba**). Se usa mientras no haya una cuenta conectada por OAuth |
| `MERCADOPAGO_TEST_MODE` | `true` mientras se prueba con usuarios de prueba |
| `SUBLIME_PAYMENTS_IN_PRODUCTION` | `enabled`, solo en producción y cuando se aprueba cobrar |

Las URLs se arman con `SITE_URL` (o `BETTER_AUTH_URL`), que tiene que ser el dominio público del entorno. Después de cambiar variables hay que **reconstruir** con `deploy-staging.sh` / `deploy-production.sh`.

Si falta algo, Admin → Integraciones lista qué variables faltan, y los pedidos siguen con el pago coordinado a mano.

### 3. Probar en staging
1. En Tus integraciones → **Cuentas de prueba**, crear un **vendedor** y un **comprador**.
2. Con `MERCADOPAGO_TEST_MODE=true`, conectar la cuenta **vendedor de prueba** desde Admin → Integraciones. Conviene hacerlo en una ventana privada, para no usar tu sesión real de Mercado Pago.
3. Hacer un pedido y pagarlo con el **comprador de prueba**, usando las [tarjetas de prueba](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards). El nombre del titular define el resultado: `APRO` aprueba, `OTHE` rechaza, `CONT` queda pendiente.
4. Revisar cada caso de la tabla de arriba. El pedido tiene que pasar a Pagado solo, y el historial tiene que decir "mercadopago".

### 4. Pasar a cobros reales
- [ ] Todos los casos probados en staging.
- [ ] Aplicación definitiva (cuenta del negocio) con URLs de producción.
- [ ] `production.env`: variables de la aplicación, `SUBLIME_PAYMENTS_IN_PRODUCTION=enabled`, **sin** `MERCADOPAGO_TEST_MODE`.
- [ ] Reconstruir producción y conectar la **cuenta real** del negocio desde Admin → Integraciones.
- [ ] Un pago real chico de punta a punta, y devolverlo desde Mercado Pago.

## Código

- **Configuración y cifrado:** `src/server/payments/config.ts` y `crypto.ts`.
- **Cliente REST:** `mercadopago.ts` (OAuth, `POST /v1/orders`, `GET /v1/orders/{id}`; sin SDK).
- **Cuenta conectada:** `accounts.ts` (tokens cifrados, renovación con control de concurrencia).
- **Inicio del pago:** `checkout.ts`. **Webhook:** `webhook.ts` (firma y conciliación).
- **Rutas:**
  - `/api/mercadopago/connect` y `/api/mercadopago/callback`: solo el dueño.
  - `/api/mercadopago/webhook`: público, con firma.
  - Las tres siguen abiertas con la tienda en mantenimiento.
- **Base:** `db/migrations/0019_mercadopago.sql`, con las tablas `payment_accounts` y `payments`.
- **Tests:** `payments-config`, `mercadopago-account`, `payments-checkout` y `mercadopago-webhook`.

## Pendiente

- **OAuth bloqueado por Mercado Pago (2026-10-31):** con la aplicación "Sublime Tienda", la autorización devuelve "La aplicación no está preparada para conectarse a Mercado Pago" después del login, con cualquier cuenta y variante del pedido. No está documentado; se consultó al soporte de developers. Mientras tanto se cobra en **modo directo** (`MERCADOPAGO_ACCESS_TOKEN`).

- **Panel del pedido:** mostrar en el admin los pagos de Mercado Pago de cada pedido. Hoy quedan en la tabla `payments` y en el historial.
- **Devoluciones** desde el admin. Hoy se hacen desde Mercado Pago.
- **Facturación:** fuera de alcance (pendiente 5.2).
