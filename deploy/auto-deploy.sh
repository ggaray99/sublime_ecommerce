#!/usr/bin/env bash
# Pull-based automatic deploy (cron, every minute, as `deploy`): when the
# watched branch has a new commit, export it to /srv/sublime/src and run
# deploy-staging.sh. The VPS reads GitHub with a read-only deploy key; GitHub
# holds no credential for the server.
#
# /srv/sublime/deploy.conf:  BRANCH=feat/vps-self-hosting
# A failed commit is not retried every minute: push a new commit (or delete
# /srv/sublime/.last-attempt) to try again. Log: /srv/sublime/auto-deploy.log
set -euo pipefail
umask 077

ROOT=/srv/sublime
REPO="$ROOT/repo.git"
cd "$ROOT"
exec 9>"$ROOT/.auto-deploy.lock"
flock -n 9 || exit 0

# shellcheck disable=SC1091
. "$ROOT/deploy.conf"
: "${BRANCH:?BRANCH missing in deploy.conf}"

[ -d "$REPO" ] || git clone --quiet --bare git@github-sublime:ggaray99/sublime_ecommerce.git "$REPO"
git --git-dir="$REPO" fetch --quiet --prune origin "+refs/heads/$BRANCH:refs/heads/$BRANCH"
SHA=$(git --git-dir="$REPO" rev-parse "refs/heads/$BRANCH")

[ "$SHA" = "$(cat .deployed-sha 2>/dev/null)" ] && exit 0
[ "$SHA" = "$(cat .last-attempt 2>/dev/null)" ] && exit 0
echo "$SHA" > .last-attempt

{
  echo "=== $(date -u +%FT%TZ) deploy $BRANCH @ ${SHA:0:7}"
  NEW=$(mktemp -d "$ROOT/.src.XXXXXX")
  git --git-dir="$REPO" archive "$SHA" | tar -x -C "$NEW"
  chmod 755 "$NEW"
  rm -rf "$ROOT/src.previous"
  [ -d "$ROOT/src" ] && mv "$ROOT/src" "$ROOT/src.previous"
  mv "$NEW" "$ROOT/src"
  if bash "$ROOT/src/deploy/deploy-staging.sh"; then
    echo "$SHA" > .deployed-sha
    echo "=== ok ${SHA:0:7}"
  else
    echo "=== FALLÓ ${SHA:0:7}: staging sigue con la versión anterior"
    exit 1
  fi
} >> "$ROOT/auto-deploy.log" 2>&1
