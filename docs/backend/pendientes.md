# Pendientes del backend

Lista viva de lo que quedó para revisar después. Cada ítem dice de qué fase viene y qué hace falta para cerrarlo. Al resolverlo, se borra de acá y se anota en el documento de su fase.

Última actualización: 10/11/2026.

## Fases del roadmap técnico sin cerrar (revisión del 24/10/2026)

| Fase | Qué falta | Qué hace falta |
| --- | --- | --- |
| 0 · Preparación | **Probar una restauración de la base** (el criterio era "restauración probada"; hoy solo está documentada) | Restaurar staging en una rama de Neon y medir el tiempo. Lo puede hacer desarrollo |
| 2 · Identidad | **Recuperación de contraseña** y verificación de email | Proveedor de email (4.3) |
| 5 · Pagos | Fase completa | Aprobación explícita (5.1) |
| 7 · Encargos y lanzamiento | Cobro de la **seña y el saldo** de los encargos (hoy la seña es informativa) | Junto con pagos (5.1) |
| 7 · Encargos y lanzamiento | **Endurecimiento y lista de lanzamiento**: revisión de seguridad, pruebas de integración, respaldos y restauración, checklist aprobado | Desarrollo (etapas 1 y 5 de [plan-produccion.md](plan-produccion.md)) |

## Checkout y cuenta del cliente (pedido del 10/11/2026)

Referencia: capturas de Mercado Libre (nuevo domicilio, direcciones de la cuenta, datos de facturación, facturación en el checkout).

| # | Pendiente | Estado actual | Qué hace falta |
| --- | --- | --- | --- |
| C.1 | **Acceso al admin sin escribir la URL**: un botón que solo vean los usuarios con acceso al panel | No hay enlace a `/admin` en la tienda | Mostrarlo en el encabezado solo si la sesión tiene acceso al panel |
| C.2 | **Teléfono obligatorio** en el checkout | Hoy es opcional | Validarlo en el formulario y en el servidor |
| C.3 | **Domicilio de entrega como Mercado Libre**: dirección, "La calle no tiene número", provincia, localidad/barrio, código postal ("No sé mi CP"), departamento (opcional), nombre y apellido, teléfono, "Elegir como predeterminada". Hasta **5** direcciones de entrega por cliente, con una predeterminada | Ya existe la libreta con predeterminada, con límite de 10 | Bajar el límite a 5 (decidir qué pasa con quien ya tenga más), sumar los campos que faltan y ajustar el formulario |
| C.4 | **Pago**: solo la transferencia se coordina después; el resto debe ofrecer pagar con Mercado Pago | Los textos del checkout y del admin dicen que el pago se coordina después | Ajustar textos y flujo (prueba guiada paso a paso con el usuario) |
| C.5 | **Dirección de facturación y de envío**: cada cliente tiene ambas. Datos de facturación: CUIT, razón social, dirección y condición de IVA ("Factura B - DNI …"), con opción de elegir con cuáles facturar en el checkout | No existe | Definir los datos a pedir (DNI o CUIT según la condición de IVA). Solo se guardan los datos: emitir facturas sigue fuera de alcance (5.2) |

## Fase 4 — Pedidos y reservas

| # | Pendiente | Qué hace falta | Quién |
| --- | --- | --- | --- |
| 4.1 | **Prueba en la preview** del flujo completo: compra como invitado y con cuenta, "Mis pedidos", confirmar pago, vencimiento a los 15 minutos y cancelación | Recorrerlo en el navegador ([fase-4-pedidos.md](fase-4-pedidos.md), "Pendiente de probar") | Negocio |
| 4.2 | **Plazo de la reserva** mientras el pago se coordina por transferencia: 15 minutos es corto | Definir el plazo (ej.: 2 h o 24 h) y cambiar `RESERVATION_MINUTES` en `src/server/orders/repository.ts` | Negocio decide, desarrollo aplica |
| 4.3 | **Emails al cliente**: confirmación del pedido, pago recibido, enviado | Elegir y aprobar un proveedor de email (ej.: Resend, por el Marketplace de Vercel) | Negocio aprueba |
| 4.4 | **Pedidos pagados que se cancelan**: política de devolución y reposición de stock | Definir la política. Después: estado y movimiento de reposición | Negocio decide |
| 4.5 | **Pedidos "En revisión"** (pago tardío sin stock): procedimiento | Definir quién decide entre reponer, demorar o devolver, y en qué plazo | Negocio decide |

## Fase 6 — Envíos

| # | Pendiente | Qué hace falta | Quién |
| --- | --- | --- | --- |
| 6.1 | **Prueba en la preview** de envíos: CP 5500, envío gratis por monto, zona sin cobertura, seguimiento | Recorrerlo ([fase-6-envios.md](fase-6-envios.md)) | Negocio |
| 6.2 | **Reglas y retiro reales**: costos, zonas, plazos, envío gratis y dirección del taller | Cargarlos en `/admin/envios` (hoy son demo) | Negocio |
| 6.3 | Integración con empresas de envío (cotización automática, etiquetas) | Solo si se decide trabajar con una (Correo Argentino, Andreani…); hoy el costo es por reglas y el seguimiento se carga a mano | Negocio decide |

## Fase 7 — Encargos

| # | Pendiente | Qué hace falta | Quién |
| --- | --- | --- | --- |
| 7.1 | **Conectar el almacenamiento privado** `sublime-staging-private` (Preview y Development, prefijo `PRIVATE_BLOB`) para habilitar los adjuntos | Conectarlo en Vercel → Storage y redesplegar | Negocio / dueño de la cuenta |
| 7.2 | **Prueba en la preview** del flujo de encargos | Recorrerlo ([fase-7-encargos.md](fase-7-encargos.md), "Pendiente de probar") | Negocio |
| 7.3 | **Aviso por email** al cliente cuando llega el presupuesto | Proveedor de email (4.3) | Negocio aprueba |

## Puntos de venta

| # | Pendiente | Qué hace falta | Quién |
| --- | --- | --- | --- |
| P.1 | **Cargar los puntos reales** | Panel → Puntos de venta ([puntos-de-venta.md](puntos-de-venta.md)) | Negocio |
| P.2 | **Todos los marcadores en un mismo mapa** | Clave de la API de Google Maps (proyecto de Google Cloud con facturación; uso gratuito con este tráfico) | Negocio decide |

## Fase 5 — Pagos (Mercado Pago en código, falta probarlo en staging)

| # | Pendiente | Qué hace falta |
| --- | --- | --- |
| 5.1 | Probar Mercado Pago en staging con usuarios de prueba y pasar a cobros reales | Crear la aplicación y cargar las variables ([fase-5-pagos.md](fase-5-pagos.md)); decidir en qué cuenta queda la aplicación antes del lanzamiento. La transferencia sigue con verificación manual |
| 5.2 | Impuestos y facturación | Definición contable. Fuera del alcance técnico actual |

## API de administración (próximas versiones)

| # | Pendiente | Qué hace falta |
| --- | --- | --- |
| A.1 | Importación de CSV en segundo plano, con plantillas oficiales | Desarrollo ([api-admin-v1.md](api-admin-v1.md)) |
| A.2 | Imágenes por API (archivo o URL de dominios permitidos) | Desarrollo y la lista de dominios permitidos |
| A.3 | Promociones (vigencia, alcance, descuento) | Diseño junto con pagos. Hoy no hay descuentos |
| A.4 | Webhooks salientes (`product.updated`, `stock.low`) | Solo si alguna integración los necesita |
| A.5 | Acceso de n8n a la preview (está protegida con login de Vercel) | Activar "Protection Bypass for Automation" en Vercel, o esperar a producción |

## Varios

| # | Pendiente | Qué hace falta |
| --- | --- | --- |
| V.1 | Quitar el rol dueño del usuario de prueba QA (`qa.sublime.staging.1022@example.com`) en staging | `DELETE FROM admin_users WHERE email = '…'` en Neon. Falta una pantalla para administrar usuarios del panel |
| V.2 | Recuperación de contraseña y verificación de email de las cuentas | Proveedor de email (ver 4.3) |
| V.3 | `docs/auditoria-tecnica-backend-v1.1.md` está solo en local, sin commitear | Decidir si se versiona en el repositorio |
| V.4 | Datos de prueba en staging: pedidos cancelados de la prueba de concurrencia y el producto archivado "PRUEBA concurrencia (borrar)" | Opcional: limpiarlos antes de mostrar staging a terceros |
