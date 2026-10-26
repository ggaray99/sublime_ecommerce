#!/usr/bin/env bash
# Builds and starts staging from the code in /srv/sublime/src.
#
#   bash deploy/deploy-staging.sh
#
# Order matters: migrations and staging seeds first (the build reads the
# database), then the image built with staging.env as a build secret, then the
# container. Seeds are recorded like migrations, so each one runs only once.
set -euo pipefail
umask 077

ROOT=/srv/sublime
cd "$ROOT"

install -m 644 src/deploy/compose.yaml compose.yaml

docker build -q --target migrate -t sublime:migrate src >/dev/null
docker run --rm --network sublime_internal --env-file staging.env sublime:migrate \
  node scripts/db-migrate.mjs --target=staging --apply --seed

# During the build the database is reached through the host port (127.0.0.1:5433).
BUILD_ENV=$(mktemp "$ROOT/.build-env.XXXXXX")
trap 'rm -f "$BUILD_ENV"' EXIT
sed 's#@postgres:5432/#@127.0.0.1:5433/#' staging.env > "$BUILD_ENV"

DOCKER_BUILDKIT=1 docker build --network host --secret id=dotenv,src="$BUILD_ENV" \
  --build-arg ENV_FINGERPRINT="$(sha256sum staging.env | cut -c1-16)" -t sublime:staging src

docker compose -f compose.yaml up -d staging
docker image prune -f >/dev/null
echo "✔ staging desplegado: https://staging.sublime.consulte.app"
