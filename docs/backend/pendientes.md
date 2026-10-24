# Pendientes del backend

Lista viva de lo que quedó para revisar después. Cada ítem dice de qué fase viene y qué hace falta para cerrarlo. Al resolverlo, se borra de acá y se anota en el documento de su fase.

Última actualización: 24/10/2026.

## Fases del roadmap técnico sin cerrar (revisión del 24/10/2026)

| Fase | Qué falta | Qué hace falta |
| --- | --- | --- |
| 0 · Preparación | **Probar una restauración de la base** (el criterio era "restauración probada"; hoy solo está documentada) | Restaurar staging en una rama de Neon y medir el tiempo. Lo puede hacer desarrollo |
| 2 · Identidad | **Recuperación de contraseña** y verificación de email | Proveedor de email (4.3) |
| 5 · Pagos | Fase completa | Aprobación explícita (5.1) |
| 7 · Encargos y lanzamiento | Cobro de la **seña y el saldo** de los encargos (hoy la seña es informativa) | Junto con pagos (5.1) |
| 7 · Encargos y lanzamiento | **Endurecimiento y lista de lanzamiento**: revisión de seguridad, pruebas de integración, respaldos y restauración, checklist aprobado | Desarrollo (etapas 1 y 5 de [plan-produccion.md](plan-produccion.md)) |

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

## Fase 5 — Pagos (no iniciada)

| # | Pendiente | Qué hace falta |
| --- | --- | --- |
| 5.1 | Mercado Pago (modo prueba) y transferencia con verificación manual | **Aprobación explícita** para integrar pagos. Cuenta de Mercado Pago del negocio (credenciales de prueba) |
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
