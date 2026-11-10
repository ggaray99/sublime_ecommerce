# VPS · Paso 1 — Código listo para correr fuera de Vercel y Neon

Estado: rama `feat/vps-self-hosting` (sale de `feat/backend-fundaciones`). Nada del servidor se tocó todavía.

Arquitectura destino: tienda y staging en Docker en el VPS de Hostinger, con Postgres, archivos en disco y respaldo diario. DNS ya cargado: `sublime.consulte.app` y `staging.sublime.consulte.app` apuntan a `72.60.149.168`.

## Qué cambió

| Pieza | Antes | Ahora |
| --- | --- | --- |
| Base de datos | Driver de Neon por HTTP | `pg` (node-postgres) con un pool. Funciona con cualquier Postgres, incluido Neon mientras siga existiendo |
| Cuentas | Neon Auth (servicio externo) | Better Auth dentro de la app. Tablas `auth_*` en nuestra base (migración `0011_auth`) |
| Fotos | Vercel Blob público | Disco (`MEDIA_ROOT/public`), servidas por `/media/*` con caché de un año |
| Adjuntos de encargos | Vercel Blob privado | Disco (`MEDIA_ROOT/private`), solo por la ruta protegida; nunca por `/media/*` |
| Entorno | `VERCEL_ENV` | `SUBLIME_ENV` (`production` o `staging`). `VERCEL_ENV=production` sigue protegido |
| Despliegue | Vercel | Imagen Docker (`Dockerfile`, salida `standalone` de Next.js) |

Dependencias quitadas: `@neondatabase/serverless`, `@neondatabase/auth`, `@vercel/blob`. Agregadas: `pg`, `better-auth`.

## Variables de entorno

Nombres en [`.env.example`](../../.env.example). Por entorno:

- `SUBLIME_ENV`: `staging` o `production`. En producción, base, cuentas y archivos siguen apagados hasta activar sus `SUBLIME_*_IN_PRODUCTION=enabled`.
- `DATABASE_URL`: una base por entorno.
- `BETTER_AUTH_SECRET`: 32 caracteres aleatorios o más, distinto por entorno.
- `BETTER_AUTH_URL`: la URL pública exacta. Desde otro origen el ingreso se rechaza.
- `MEDIA_ROOT`: carpeta de archivos (volumen de Docker).

## La imagen se construye por entorno

Partes de las páginas se generan al construir y ahí deciden si cuentas, base y archivos están activos. Por eso la imagen se construye **con el archivo de entorno de ese ambiente y la base accesible**, como hacía Vercel:

```sh
docker build --network host --secret id=dotenv,src=/srv/sublime/staging.env -t sublime:staging .
```

El archivo entra como secreto de construcción: se usa durante `next build` y no queda guardado en la imagen. Una imagen construida sin entorno muestra "no disponible" en cuentas y encargos. Lo comprobé en la prueba local.

## Verificado

- 225 pruebas, lint, tipos y build sin advertencias.
- Migración `0011_auth` aplicada en la base de staging de Neon.
- Prueba local del build de producción (`server.js` standalone) contra staging:
  - registro, email repetido (422), contraseña incorrecta (401), origen ajeno bloqueado (403) y cierre de sesión;
  - Mi cuenta muestra al cliente, y sin sesión redirige a `/cuenta/ingresar`;
  - `/admin` da 404 a quien no es admin;
  - `/encargos` queda activo;
  - `/media/*` sirve fotos y rechaza rutas con `..`.
- Las cuentas de prueba se borraron.

## Consecuencias

- **Las cuentas creadas con Neon Auth no pasan.** En el VPS la base arranca limpia y los admins se vuelven a dar con `npm run admin:grant` después de registrarse.
- **Previews de Vercel de esta rama:** no tienen `BETTER_AUTH_SECRET` ni `MEDIA_ROOT`, así que muestran cuentas y cargas como no disponibles. Es lo esperado: staging pasa al VPS.
- `src/data/site.ts` sigue apuntando a la URL de Vercel para metadatos y sitemap. Se cambia en el corte (paso 4).
- El script de migraciones sigue bloqueado en producción. El modo producción se agrega con el corte.

## Sigue: paso 2 (VPS)

Revisar cómo está armado el n8n (proxy, Docker Compose), crear usuario sin root con llaves SSH, firewall, Postgres con dos bases, `compose.yaml` con staging, proxy con HTTPS, respaldo diario con prueba de restauración y despliegue desde GitHub Actions.
