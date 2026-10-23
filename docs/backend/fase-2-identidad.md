# Fase 2 — Identidad y clientes

Estado: **activo en staging y verificado de punta a punta**. Producción no tiene cuentas: el código las desactiva en `VERCEL_ENV=production`.

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
- Errores de Neon Auth se traducen a mensajes en español sin exponer detalles internos (`src/server/auth/errors.ts`). Neon informa un email ya registrado como `validation_failed` / 422; en el registro se muestra "No pudimos crear una cuenta con ese email. Si ya tenés cuenta, probá ingresar." Los códigos no reconocidos se registran en el log del servidor solo con código y estado HTTP, nunca con el mensaje.
- Límite de 10 direcciones por cliente; una sola dirección principal (también forzado por índice único en la base).
- Código postal argentino (CPA `C1425ABC` o 4 dígitos) y provincia de una lista cerrada.

### Pruebas

`tests/customers.test.mjs` (18 tests): traducción de errores de auth (incluye dominio no permitido), activación por entorno, validaciones, y repositorio sobre PostgreSQL (PGlite) — vínculo idempotente, dirección principal única, promoción al borrar, **aislamiento entre clientes**, ids maliciosos, límite de direcciones y restricciones de la base.

## Prueba de punta a punta (22/10/2026, local contra staging)

Registro → sesión iniciada y cliente vinculado → guardar teléfono → agregar dirección (queda principal) → cerrar sesión → `/cuenta` redirige a ingresar → contraseña incorrecta ("Email o contraseña incorrectos.", conserva el email) → ingreso correcto con la dirección guardada → registro duplicado rechazado con mensaje claro.

Usuario de prueba en staging: `qa.sublime.staging.1022@example.com` (contraseña fuera del repositorio). Se puede borrar desde Neon Console → Auth → Users.

## Activación (referencia)

Neon Auth necesita dos variables. `NEON_AUTH_BASE_URL` la crea la integración (Preview y Development). Configuración aplicada:

1. **Vercel → proyecto → Settings → Environment Variables → Add**
   - Nombre: `NEON_AUTH_COOKIE_SECRET`
   - Valor: un texto aleatorio de 32+ caracteres. Generarlo con:
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - Entornos: **solo Preview** (Vercel no permite secretos en Development; local usa `.env.local`). Tipo **Secret**.
2. **Local:** `.env.local` con `NEON_AUTH_BASE_URL` (valor en Vercel → Environment Variables) y un `NEON_AUTH_COOKIE_SECRET` propio.
3. Hacer un nuevo deploy de la rama para que la preview tome las variables.

## Pendiente

- **Recuperación de contraseña:** el SDK la soporta, pero requiere configurar envío de emails en Neon Auth. Sin proveedor de email confirmado, no está habilitada.
- **Verificación de email:** depende de la misma configuración de emails.
- **Dominios permitidos (bloquea el registro en la preview):** el 23/10/2026 el registro en la URL de preview falló. Neon Auth respondió `feature_not_supported` / 403 porque el dominio no está en su lista de confianza; `localhost` viene aprobado por defecto. Solución: Neon Console → Auth → Configuration → Domains, agregar la URL de preview o un comodín para las previews del proyecto. Mientras tanto, el sitio muestra "El ingreso no está habilitado desde esta dirección del sitio." Referencia: https://neon.com/docs/auth/guides/configure-domains
- **Producción:** habilitar cuentas requiere base de producción, política de privacidad publicada y aprobación explícita.
