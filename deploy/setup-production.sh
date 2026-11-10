#!/usr/bin/env bash
# One-time setup of the store (production): its database, role, media folder and
# production.env. Safe to re-run: it never overwrites an existing secret. Prints
# no secret values. Starts in maintenance mode (SUBLIME_MAINTENANCE=1).
#
#   sudo bash /srv/sublime/src/deploy/setup-production.sh
set -euo pipefail
umask 077

ROOT=/srv/sublime
OWNER=deploy
DOMAIN=sublimestudio.com.ar
cd "$ROOT"
install -m 644 src/deploy/compose.yaml compose.yaml

mkdir -p media/production
# The app runs as uid 10001 inside the container.
chown -R 10001:10001 media/production

if [ ! -f .production-db-password ]; then
  openssl rand -hex 24 > .production-db-password
fi
PRODUCTION_DB_PASSWORD=$(cat .production-db-password)

if [ ! -f production.env ]; then
  cat > production.env <<EOF
SUBLIME_ENV=production
SUBLIME_MAINTENANCE=1
DATABASE_URL=postgres://sublime_prod:${PRODUCTION_DB_PASSWORD}@postgres:5432/sublime_prod
SUBLIME_DB_IN_PRODUCTION=enabled
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
BETTER_AUTH_URL=https://${DOMAIN}
SUBLIME_AUTH_IN_PRODUCTION=enabled
MEDIA_ROOT=/data/media
SUBLIME_MEDIA_IN_PRODUCTION=enabled
EOF
  echo "✔ production.env creado (en modo mantenimiento)"
fi

# Secrets added later to the store (also on an existing production.env); never overwritten.
add_secret() {
  grep -q "^$1=" production.env && return 0
  # A hand-edited file may lack the final newline: never glue onto its last line.
  [ -z "$(tail -c1 production.env)" ] || echo >> production.env
  echo "$1=$2" >> production.env
  echo "✔ $1 agregado"
}
# The every-minute cron (deploy/outbox.sh): notifications, low stock, lost Mercado Pago notices.
add_secret OUTBOX_TOKEN "$(openssl rand -hex 32)"
# Encrypts the Mercado Pago tokens stored by the OAuth connection. Changing it means connecting again.
add_secret PAYMENTS_ENCRYPTION_KEY "$(openssl rand -base64 32)"

chown "$OWNER:$OWNER" production.env .production-db-password
chmod 600 production.env .production-db-password

docker compose -f compose.yaml up -d postgres
for _ in $(seq 1 30); do
  docker compose -f compose.yaml exec -T postgres pg_isready -U sublime_admin >/dev/null 2>&1 && break
  sleep 2
done

# Role and database for the store, created once; staging cannot reach it.
docker compose -f compose.yaml exec -T postgres psql -v ON_ERROR_STOP=1 -U sublime_admin -d postgres \
  -v pw="$PRODUCTION_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE sublime_prod LOGIN PASSWORD %L', :'pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sublime_prod') \gexec
SELECT 'CREATE DATABASE sublime_prod OWNER sublime_prod'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'sublime_prod') \gexec
REVOKE CONNECT ON DATABASE sublime_prod FROM PUBLIC;
SQL
echo "✔ base sublime_prod lista"
