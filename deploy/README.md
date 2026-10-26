# Sublime en el VPS

VPS de Hostinger (KVM 2, Ubuntu 24.04, `72.60.149.168`). Comparte el servidor con n8n y Chatwoot, que no se tocan.

| Qué | Dónde |
| --- | --- |
| Staging | https://staging.sublime.consulte.app (protegido con usuario y contraseña) |
| Tienda | https://sublimestudio.com.ar (en mantenimiento: el público ve "Estamos trabajando"; `/admin` funciona) |
| Archivos de Sublime | `/srv/sublime` (dueño: usuario `deploy`) |
| Proxy con HTTPS | Traefik de `/root/docker-compose.yml` (el mismo de n8n). Sublime solo le agrega etiquetas |
| Base | Contenedor `sublime-postgres-1`, una base por entorno, puerto `127.0.0.1:5433` (no sale a internet) |
| Respaldos | `/srv/sublime/backups` (14 días) + copia cifrada en Google Drive, carpeta `sublime-backups` (60 días). Todos los días a las 03:30 UTC |
| Encargos en Drive | Cada encargo nuevo se copia a Google Drive (`Sublime Encargos/ENC-… - Cliente - Tipo`) con `detalle.txt` y sus archivos por tipo. Cron cada 2 minutos (`deploy/drive-sync.py`, log `/var/log/sublime-drive.log`). Sin cifrar, para abrirlos directo. Ya copiados: `/srv/sublime/.drive-synced` |
| Avisos | Cola de avisos procesada cada minuto (`deploy/outbox.sh`, log `/srv/sublime/outbox.log`). Canal opcional: `NOTIFY_WEBHOOK_URL` en `staging.env` |
| Despliegue | Automático: el VPS revisa GitHub cada minuto y despliega la rama de `deploy.conf`. Log: `/srv/sublime/auto-deploy.log` |

## Estructura de `/srv/sublime`

```
compose.yaml          copia de deploy/compose.yaml (se actualiza en cada deploy)
src/                  código desplegado
postgres.env          clave del admin de Postgres                     (600)
staging.env           entorno de staging: base, secreto de cuentas…   (600)
production.env        entorno de la tienda (incluye SUBLIME_MAINTENANCE) (600)
media/production/     fotos y adjuntos de la tienda
.env                  hash de la contraseña de staging para Traefik   (600)
staging-access.txt    usuario y contraseña para entrar a staging      (600)
media/staging/        fotos y adjuntos (uid 10001 = usuario de la app)
backups/AAAAMMDD-HHMM/ copias de las bases y de media
rclone.conf, backup-crypt-*.txt  acceso a Drive y claves de cifrado (root, 600)
deploy.conf           rama que se despliega sola
```

Los secretos se generan en el servidor con `setup-staging.sh` y no salen de ahí. Para ver la contraseña de staging, en la Consola web: `cat /srv/sublime/staging-access.txt`.

## Operaciones

| Tarea | Comando (como `deploy`) |
| --- | --- |
| Desplegar staging | Push a la rama de `/srv/sublime/deploy.conf`: se despliega solo en 1–2 minutos. Reintentar uno fallido: `rm /srv/sublime/.last-attempt` |
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

## Tienda (producción)

Se despliega **a mano**, nunca sola: el despliegue automático solo toca staging.

| Tarea | Comando |
| --- | --- |
| Primera vez (base, secretos) | `sudo bash /srv/sublime/src/deploy/setup-production.sh` |
| Desplegar la versión que corre en staging | `bash /srv/sublime/src/deploy/deploy-production.sh` |
| Abrir la tienda al público | En `production.env` cambiar `SUBLIME_MAINTENANCE=1` por `0` y `docker compose -f /srv/sublime/compose.yaml up -d production` (sin reconstruir) |
| Dar admin | Registrarse en https://sublimestudio.com.ar/cuenta/ingresar y correr `admin-grant` con `--env-file production.env --target=production` |

En mantenimiento (`src/proxy.ts`), todas las páginas públicas muestran `/mantenimiento` con `X-Robots-Tag: noindex` y `robots.txt` bloquea todo. Siguen abiertos `/admin`, `/cuenta` (para iniciar sesión), `/api/auth`, `/api/admin`, `/api/internal` y `/media`.

La base `sublime_prod` arranca vacía: sin los datos de prueba de staging. El catálogo, las reglas de envío y los puntos de venta reales se cargan desde el panel.

## Cómo se construye

`deploy-staging.sh` hace tres cosas, en orden:

1. Aplica las migraciones con la imagen `sublime:migrate`.
2. Construye la app. El `next build` lee la base y la configuración, porque parte de las páginas se generan ahí. `staging.env` entra como secreto de construcción y no queda guardado en la imagen.
3. Reinicia el contenedor.

## Pendiente

- **Quitarle a `deploy` el sudo sin clave** cuando termine el armado.

## Seguridad del servidor

- SSH solo con llave (`/etc/ssh/sshd_config.d/00-sublime-hardening.conf`); `root` no entra por contraseña. La Consola web de Hostinger sigue funcionando.
- El VPS lee GitHub con una llave de solo lectura (Deploy key del repo). GitHub no tiene acceso al servidor.
- Google Drive: rclone con permiso `drive.file`, que solo ve los archivos que él crea. Los respaldos suben cifrados.
