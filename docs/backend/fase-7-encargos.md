# Fase 7 — Encargos personalizados

Estado: implementado en `feat/backend-fundaciones`, solo staging. En producción sigue la simulación (el formulario no guarda nada) mientras `SUBLIME_DB_IN_PRODUCTION` esté apagado.

## Qué hace

1. **El cliente pide** en `/encargos`: nombre, email, tipo de producto, cantidad, idea, referencia y un adjunto opcional (JPG, PNG, WEBP o PDF, hasta 4 MB). Si entró desde un producto, queda anotado.
2. **Recibe un número** (`ENC-5001`, …) y un enlace privado `/encargo/<id>?t=<token>`. Si tiene cuenta, el encargo aparece también en **Mi cuenta → Mis encargos**.
3. **El admin responde** en `/admin/encargos/<id>` con un presupuesto: total, seña sugerida (informativa), mensaje, validez y días de producción. Puede actualizarlo mientras el cliente no decida.
4. **El cliente acepta o rechaza** desde su enlace, con una nota opcional. Si el presupuesto venció, no puede aceptarlo y se le pide escribir.
5. **El admin sigue el trabajo**: en producción → entregado, o cancelar con motivo (obligatorio).

Estados: recibido, presupuestado, aceptado, rechazado, en producción, entregado, cancelado. Cada cambio queda en el historial con quién lo hizo.

## Seguridad

- **Adjuntos privados** en un store de Vercel Blob privado. Se validan por contenido (no por extensión); SVG y otros formatos se rechazan. Solo los descargan el cliente (con el enlace o su sesión) y los admins, por `/api/encargos/<id>/archivos/<fileId>`, siempre como descarga y sin caché.
- La página del encargo no se indexa y no envía el enlace como referer.
- **Anti-abuso**: campo trampa para bots, máximo 5 solicitudes por hora por email, y clave de idempotencia para que un doble clic no cree dos encargos.
- Sin almacenamiento privado configurado, el formulario funciona igual pero sin el campo de adjunto.

## Piezas

| Pieza | Archivo |
| --- | --- |
| Migración | `db/migrations/0010_custom_requests.sql` |
| Repositorio y transiciones | `src/server/custom-requests/repository.ts` |
| Validación | `src/server/custom-requests/validation.ts` |
| Adjuntos privados | `src/server/media/private-files.ts` |
| Formulario | `src/components/quote-form.tsx`, `src/app/encargos/actions.ts` |
| Página del cliente | `src/app/encargo/[id]/` |
| Panel | `src/app/admin/encargos/` |
| Pruebas | `tests/custom-requests.test.mjs` |

## Configuración pendiente

Conectar el store privado `sublime-staging-private` al proyecto (Preview y Development) con el prefijo `PRIVATE_BLOB`. La app acepta `PRIVATE_BLOB_STORE_ID` (OIDC) o `PRIVATE_BLOB_READ_WRITE_TOKEN`.

## Pendiente de probar en la preview

- Pedir un encargo como invitado con un adjunto y abrir el enlace privado.
- Pedirlo con cuenta y verlo en Mis encargos.
- Responder con un presupuesto, aceptarlo, pasarlo a producción y entregarlo.
- Rechazar otro; cancelar uno con motivo.
- Descargar el adjunto desde el panel y comprobar que sin el enlace da 404.

## Fuera de alcance

- **Cobro de seña y saldo**: la seña es informativa hasta que se aprueben pagos (Fase 5).
- **Avisos por email** al cliente cuando llega el presupuesto: dependen del proveedor de email (pendiente 4.3). Hoy el admin le escribe por mail o WhatsApp con el enlace.
