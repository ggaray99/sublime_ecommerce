# Cobrar con Mercado Pago en la tienda Sublime

Esta guía es para el dueño de la cuenta de Mercado Pago que va a **recibir el dinero** de las ventas. Lleva unos 20 minutos y se hace una sola vez, idealmente junto con quien administra la tienda.

Al terminar, los clientes van a poder pagar sus pedidos con tarjeta, dinero en cuenta o Mercado Crédito, y el dinero va a entrar directo a tu cuenta de Mercado Pago.

## Antes de empezar

- Usá la cuenta de Mercado Pago **donde querés recibir el dinero**, con tus datos y tu identidad validados.
- Hacelo desde una computadora.
- Vas a copiar cuatro datos al final. **No los mandes por WhatsApp, email ni ningún chat:** permiten operar con tu cuenta. Se pegan directamente en el servidor de la tienda, con quien la administra al lado.

## 1. Crear la aplicación

1. Entrá a [Mercado Pago Developers → Tus integraciones](https://www.mercadopago.com.ar/developers/panel/app) e iniciá sesión con tu cuenta.
2. Tocá **Crear aplicación**.
3. Completá lo que pide el panel. Lo importante:
   - **Nombre:** Sublime Tienda.
   - **Solución:** **Checkout Pro** (pagos online).
   - **API:** **API de Orders**. No elijas la de Preferences: el panel avisa que se va a discontinuar.
   - Si pregunta por una plataforma de e-commerce, elegí que **no** usás ninguna: la tienda es propia.
4. Aceptá las condiciones y creala.

## 2. Activar las credenciales de producción

1. Dentro de la aplicación, andá a **Credenciales de producción**.
2. Completá lo que te pida:
   - **Industria:** la del negocio.
   - **Sitio web:** `https://sublimestudio.com.ar`.
3. Aceptá los términos y activalas.

## 3. Configurar las notificaciones (webhook)

Las notificaciones son las que le avisan a la tienda que un pedido se pagó.

1. En la aplicación, andá a **Webhooks → Configurar notificaciones**.
2. Elegí el **modo productivo** y completá:
   - **URL:** `https://sublimestudio.com.ar/api/mercadopago/webhook`
   - **Eventos:** marcá solo **Order (Mercado Pago)**.
3. Guardá. Se genera una **clave secreta**.

## 4. Los cuatro datos que necesita la tienda

Con quien administra la tienda al lado, copiá estos datos **directamente en el servidor** (te va a indicar dónde):

| Dato | Dónde está |
| --- | --- |
| **Client ID** (es un número) | Credenciales de producción |
| **Client Secret** | Credenciales de producción |
| **Access Token** (empieza con `APP_USR-`) | Credenciales de producción |
| **Clave secreta del webhook** | Webhooks → Configurar notificaciones |

## 5. Primer pago de prueba

1. Hacé un pedido chico en la tienda y pagalo con la tarjeta de **otra persona**. Mercado Pago no permite pagarte a vos mismo.
2. El pedido tiene que pasar solo a **Pagado**, y el dinero tiene que aparecer en tu actividad de Mercado Pago.
3. Después, devolvé ese pago desde tu actividad en Mercado Pago (**Devolver dinero**).

## Preguntas frecuentes

- **¿Cuánto cobra Mercado Pago?** Las comisiones y plazos de acreditación son los de tu cuenta. Los ves en la configuración de costos de tu cuenta de Mercado Pago.
- **¿Puedo dejar de cobrar online?** Sí. Avisale a quien administra la tienda: los pedidos siguen con pago por transferencia.
- **¿Si cambio la contraseña de Mercado Pago deja de funcionar?** No. Solo deja de funcionar si renovás las credenciales o borrás la aplicación. En ese caso hay que cargar los datos nuevos en el servidor.
