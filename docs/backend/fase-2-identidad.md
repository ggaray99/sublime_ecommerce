# Fase 2 — Identidad y clientes

Estado: **implementado en staging; falta configurar dos variables para activarlo**. Producción no tiene cuentas: el código las desactiva en `VERCEL_ENV=production`.

## Decisiones

| Tema | Decisión |
| --- | --- |
| Proveedor de identidad | **Neon Auth** (Better Auth administrado por Neon), SDK `@neondatabase/auth` 0.7.0-beta. Elegido por simplicidad: vive en el mismo proyecto Neon. Se puede revisar más adelante. |
| Método de ingreso | Email y contraseña (mínimo 8 caracteres). Sin redes sociales por ahora. |
| Identidad vs. datos de cliente | Neon Auth guarda usuarios, contraseñas y sesiones. Sublime guarda solo el vínculo (`customers.auth_user_id`) y sus datos propios (nombre, teléfono, direcciones). |
| Disponibilidad | Las cuentas existen solo donde hay Neon Auth **y** base de datos (Preview y Development). |

## Qué existe

| Pieza | Ubicación |
| --- | --- |
| Activación por entorno | `src/server/auth/config.ts` (`isAuthEnabled`) |
| Cliente Neon Auth (perezoso) y sesión | `src/server/auth/neon.ts` |
| Endpoints de auth | `src/app/api/auth/[...path]/route.ts` (404 donde está desactivado) |
| Protección de rutas | `src/proxy.ts` → `/cuenta` y `/cuenta/direcciones/*` |
| Migración | `db/migrations/0002_customers.sql` (aplicada en staging) |
| Validación de formularios | `src/server/customers/validation.ts` |
| Repositorio de clientes y direcciones | `src/server/customers/repository.ts` |
| Cliente actual desde la sesión | `src/server/customers/session.ts` |
| Acciones de servidor | `src/app/cuenta/actions.ts` |
| Pantallas | `/cuenta/registro`, `/cuenta/ingresar`, `/cuenta` (datos, direcciones, cerrar sesión) |

### Reglas de seguridad

- El cliente se resuelve **siempre desde la cookie de sesión**. Los ids que llegan del formulario solo identifican qué dirección tocar, y toda consulta filtra además por el `customer_id` de la sesión: nadie puede leer, cambiar ni borrar direcciones ajenas (probado).
- Ids malformados se rechazan antes de llegar a SQL.
- Protección doble: `proxy.ts` redirige a `/cuenta/ingresar`, y la página vuelve a verificar la sesión en el servidor.
- Errores de Neon Auth se traducen a mensajes en español sin exponer detalles internos.
- Límite de 10 direcciones por cliente; una sola dirección principal (también forzado por índice único en la base).
- Código postal argentino (CPA `C1425ABC` o 4 dígitos) y provincia de una lista cerrada.

### Pruebas

`tests/customers.test.mjs` (13 tests): activación por entorno, validaciones, y repositorio sobre PostgreSQL (PGlite) — vínculo idempotente, dirección principal única, promoción al borrar, **aislamiento entre clientes**, ids maliciosos, límite de direcciones y restricciones de la base.

## Activación (pasos pendientes)

Neon Auth necesita dos variables. `NEON_AUTH_BASE_URL` ya la creó la integración en Vercel (Preview y Development). Falta:

1. **Vercel → proyecto → Settings → Environment Variables → Add**
   - Nombre: `NEON_AUTH_COOKIE_SECRET`
   - Valor: un texto aleatorio de 32+ caracteres. Generarlo con:
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - Entornos: **Preview** y **Development** (no Production). Marcar **Sensitive**.
2. **Local:** agregar `NEON_AUTH_BASE_URL` a `.env.local` (valor en Vercel → Environment Variables, o Neon Console → Auth → Configuration). `NEON_AUTH_COOKIE_SECRET` local ya fue generado.
3. Hacer un nuevo deploy de la rama para que la preview tome las variables.

## Pendiente

- **Recuperación de contraseña:** el SDK la soporta, pero requiere configurar envío de emails en Neon Auth. Sin proveedor de email confirmado, no está habilitada.
- **Verificación de email:** depende de la misma configuración de emails.
- **Dominios permitidos:** si Neon Auth rechaza pedidos desde las URLs de preview o `localhost`, agregarlas en Neon Console → Auth → Configuration.
- **Producción:** habilitar cuentas requiere base de producción, política de privacidad publicada y aprobación explícita.
