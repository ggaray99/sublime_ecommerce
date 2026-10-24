#!/usr/bin/env bash
# One-time setup of /srv/sublime on the VPS: folders, Postgres, the staging
# database and its secrets. Safe to re-run: it never overwrites an existing
# secret. Prints no secret values.
#
#   sudo bash deploy/setup-staging.sh
set -euo pipefail
umask 077

ROOT=/srv/sublime
OWNER=deploy
cd "$ROOT"
install -m 644 src/deploy/compose.yaml compose.yaml

rand() { openssl rand -hex "$1"; }

mkdir -p media/staging backups
# The app runs as uid 1001 inside the container.
chown -R 1001:1001 media
chown "$OWNER:$OWNER" "$ROOT" backups

if [ ! -f postgres.env ]; then
  printf 'POSTGRES_USER=sublime_admin\nPOSTGRES_PASSWORD=%s\nPOSTGRES_DB=postgres\n' "$(rand 24)" > postgres.env
  echo "✔ postgres.env creado"
fi

if [ ! -f .staging-db-password ]; then
  rand 24 > .staging-db-password
fi
STAGING_DB_PASSWORD=$(cat .staging-db-password)

if [ ! -f staging.env ]; then
  cat > staging.env <<EOF
SUBLIME_ENV=staging
DATABASE_URL=postgres://sublime_staging:${STAGING_DB_PASSWORD}@postgres:5432/sublime_staging
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
BETTER_AUTH_URL=https://staging.sublime.consulte.app
MEDIA_ROOT=/data/media
EOF
  echo "✔ staging.env creado"
fi

# Browser password for staging (Traefik basic auth). The plain password is kept
# in staging-access.txt for the owner; compose reads the hash from .env.
if [ ! -f staging-access.txt ]; then
  PASS=$(rand 9)
  printf 'Usuario: sublime\nContraseña: %s\n' "$PASS" > staging-access.txt
  HASH=$(openssl passwd -apr1 "$PASS")
  printf "STAGING_BASIC_AUTH='sublime:%s'\n" "$HASH" > .env
  echo "✔ acceso a staging creado (ver staging-access.txt)"
fi

chown "$OWNER:$OWNER" postgres.env staging.env .env staging-access.txt .staging-db-password
chmod 600 postgres.env staging.env .env staging-access.txt .staging-db-password

docker compose -f compose.yaml up -d postgres
for _ in $(seq 1 30); do
  docker compose -f compose.yaml exec -T postgres pg_isready -U sublime_admin >/dev/null 2>&1 && break
  sleep 2
done

# Role and database for staging, created once.
docker compose -f compose.yaml exec -T postgres psql -v ON_ERROR_STOP=1 -U sublime_admin -d postgres \
  -v pw="$STAGING_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE sublime_staging LOGIN PASSWORD %L', :'pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sublime_staging') \gexec
SELECT 'CREATE DATABASE sublime_staging OWNER sublime_staging'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'sublime_staging') \gexec
SQL
echo "✔ base sublime_staging lista"
