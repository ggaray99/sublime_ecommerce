# Sublime en el VPS

VPS de Hostinger (KVM 2, Ubuntu 24.04, `72.60.149.168`). Comparte el servidor con n8n y Chatwoot, que no se tocan.

| Qué | Dónde |
| --- | --- |
| Staging | https://staging.sublime.consulte.app (protegido con usuario y contraseña) |
| Tienda | `sublime.consulte.app` (DNS listo; se activa en el corte) |
| Archivos de Sublime | `/srv/sublime` (dueño: usuario `deploy`) |
| Proxy con HTTPS | Traefik de `/root/docker-compose.yml` (el mismo de n8n). Sublime solo le agrega etiquetas |
| Base | Contenedor `sublime-postgres-1`, una base por entorno, puerto `127.0.0.1:5433` (no sale a internet) |
| Respaldos | `/srv/sublime/backups`, todos los días a las 03:30 UTC, 14 días |

## Estructura de `/srv/sublime`

```
compose.yaml          copia de deploy/compose.yaml (se actualiza en cada deploy)
src/                  código desplegado
postgres.env          clave del admin de Postgres                     (600)
staging.env           entorno de staging: base, secreto de cuentas…   (600)
.env                  hash de la contraseña de staging para Traefik   (600)
staging-access.txt    usuario y contraseña para entrar a staging      (600)
media/staging/        fotos y adjuntos (uid 10001 = usuario de la app)
backups/AAAAMMDD-HHMM/ copias de las bases y de media
```

Los secretos se generan en el servidor con `setup-staging.sh` y no salen de ahí. Para ver la contraseña de staging, en la Consola web: `cat /srv/sublime/staging-access.txt`.

## Operaciones

| Tarea | Comando (como `deploy`) |
| --- | --- |
| Desplegar staging | Copiar el código a `/srv/sublime/src` y correr `bash /srv/sublime/src/deploy/deploy-staging.sh` |
| Ver logs | `docker logs -f sublime-staging-1` |
| Estado | `docker compose -f /srv/sublime/compose.yaml ps` |
| Respaldo manual | `sudo bash /srv/sublime/src/deploy/backup.sh` |
| Probar restauración | `sudo bash /srv/sublime/src/deploy/restore-test.sh` |
| Dar admin | Registrarse en staging y abrir `/cuenta`; después: `docker run --rm --network sublime_internal --env-file /srv/sublime/staging.env sublime:migrate …` (ver abajo) |

Para dar permisos de admin, el script `admin-grant` necesita el código fuente. Se corre así:

```sh
cd /srv/sublime && docker run --rm --network sublime_internal --env-file staging.env \
  -v "$PWD/src:/src:ro" -w /src node:24-bookworm-slim \
  sh -c 'npm ci --omit=dev --ignore-scripts >/dev/null && node scripts/admin-grant.mjs --target=staging --email=persona@dominio --role=owner'
```

## Cómo se construye

`deploy-staging.sh` hace tres cosas, en orden:

1. Aplica las migraciones con la imagen `sublime:migrate`.
2. Construye la app. El `next build` lee la base y la configuración, porque parte de las páginas se generan ahí. `staging.env` entra como secreto de construcción y no queda guardado en la imagen.
3. Reinicia el contenedor.

## Pendiente

- **Copia externa de los respaldos.** Hoy quedan en el mismo disco: si se pierde el VPS, se pierden también.
- **Despliegue automático desde GitHub.** Hoy el código se copia desde una computadora.
- **Cerrar el acceso por contraseña en SSH** y el ingreso como `root`.
- **Quitarle a `deploy` el sudo sin clave** cuando termine el armado.
- **Tienda (producción):** base `sublime_prod`, servicio `production` en `compose.yaml` y modo producción del script de migraciones. Se hace en el corte, con aprobación.
