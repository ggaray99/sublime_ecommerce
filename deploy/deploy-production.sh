#!/usr/bin/env bash
# Builds and starts the store from the production branch (main by default;
# PRODUCTION_BRANCH in /srv/sublime/deploy.conf changes it). Staging (QA) deploys
# itself from its own branch; the store only when someone runs this, as `deploy`
# (it owns the repository and its read-only GitHub key):
#
#   sudo -u deploy bash /srv/sublime/src/deploy/deploy-production.sh
#
# The code is exported to /srv/sublime/src-production, never mixed with staging's
# /srv/sublime/src. Same order as staging: migrations (no demo seeds), then the
# image built with production.env as a build secret (never stored in the image),
# then the container.
set -euo pipefail
umask 077

ROOT=/srv/sublime
REPO="$ROOT/repo.git"
SRC="$ROOT/src-production"
cd "$ROOT"
[ "$(id -un)" = "deploy" ] || { echo "✖ corré como deploy: sudo -u deploy bash $0"; exit 1; }
[ -f production.env ] || { echo "✖ falta production.env: corré setup-production.sh"; exit 1; }
[ -d "$REPO" ] || { echo "✖ falta $REPO: el despliegue automático de staging lo crea"; exit 1; }

# shellcheck disable=SC1091
[ -f deploy.conf ] && . ./deploy.conf
PROD_BRANCH="${PRODUCTION_BRANCH:-main}"

git --git-dir="$REPO" fetch --quiet --prune origin "+refs/heads/$PROD_BRANCH:refs/heads/$PROD_BRANCH"
SHA=$(git --git-dir="$REPO" rev-parse "refs/heads/$PROD_BRANCH")
NEW=$(mktemp -d "$ROOT/.src-production.XXXXXX")
trap 'rm -rf "$NEW"' EXIT
git --git-dir="$REPO" archive "$SHA" | tar -x -C "$NEW"
# A branch without this script predates the VPS setup: it cannot build here.
[ -f "$NEW/deploy/deploy-production.sh" ] && [ -f "$NEW/Dockerfile" ] ||
  { echo "✖ $PROD_BRANCH @ ${SHA:0:7} no tiene el armado del VPS (¿falta mergear QA en $PROD_BRANCH?)"; exit 1; }
chmod 755 "$NEW"
rm -rf "$SRC.previous"
[ -d "$SRC" ] && mv "$SRC" "$SRC.previous"
mv "$NEW" "$SRC"
trap - EXIT
echo "→ producción: $PROD_BRANCH @ ${SHA:0:7}"

# compose.yaml describes both services: it keeps coming from staging's copy.
install -m 644 src/deploy/compose.yaml compose.yaml

docker build -q --target migrate -t sublime:migrate-production "$SRC" >/dev/null
docker run --rm --network sublime_internal --env-file production.env sublime:migrate-production \
  node scripts/db-migrate.mjs --target=production --apply

BUILD_ENV=$(mktemp "$ROOT/.build-env.XXXXXX")
trap 'rm -f "$BUILD_ENV"' EXIT
sed 's#@postgres:5432/#@127.0.0.1:5433/#' production.env > "$BUILD_ENV"

DOCKER_BUILDKIT=1 docker build --network host --secret id=dotenv,src="$BUILD_ENV" \
  --build-arg ENV_FINGERPRINT="$(sha256sum production.env | cut -c1-16)" -t sublime:production "$SRC"

docker compose -f compose.yaml up -d production
docker image prune -f >/dev/null
echo "$SHA" > .production-sha
echo "✔ tienda desplegada ($PROD_BRANCH @ ${SHA:0:7}): https://sublimestudio.com.ar ($(grep -q '^SUBLIME_MAINTENANCE=1' production.env && echo 'en mantenimiento' || echo 'abierta'))"
