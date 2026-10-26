#!/usr/bin/env bash
# Builds and starts the store from the code in /srv/sublime/src (the version
# staging is running). Manual on purpose: staging deploys itself, the store
# only when someone runs this.
#
#   bash /srv/sublime/src/deploy/deploy-production.sh
#
# Same order as staging: migrations (no demo seeds), then the image built with
# production.env as a build secret (never stored in the image), then the container.
set -euo pipefail
umask 077

ROOT=/srv/sublime
cd "$ROOT"
[ -f production.env ] || { echo "✖ falta production.env: corré setup-production.sh"; exit 1; }

install -m 644 src/deploy/compose.yaml compose.yaml

docker build -q --target migrate -t sublime:migrate src >/dev/null
docker run --rm --network sublime_internal --env-file production.env sublime:migrate \
  node scripts/db-migrate.mjs --target=production --apply

BUILD_ENV=$(mktemp "$ROOT/.build-env.XXXXXX")
trap 'rm -f "$BUILD_ENV"' EXIT
sed 's#@postgres:5432/#@127.0.0.1:5433/#' production.env > "$BUILD_ENV"

DOCKER_BUILDKIT=1 docker build --network host --secret id=dotenv,src="$BUILD_ENV" \
  --build-arg ENV_FINGERPRINT="$(sha256sum production.env | cut -c1-16)" -t sublime:production src

docker compose -f compose.yaml up -d production
docker image prune -f >/dev/null
echo "✔ tienda desplegada: https://sublimestudio.com.ar ($(grep -q '^SUBLIME_MAINTENANCE=1' production.env && echo 'en mantenimiento' || echo 'abierta'))"
