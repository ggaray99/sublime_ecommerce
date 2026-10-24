#!/usr/bin/env bash
# Daily backup of every Sublime database and the media folders, kept 14 days in
# /srv/sublime/backups. Run by cron (deploy/cron). An off-site copy is still
# pending: until then a disk failure of the VPS loses the backups too.
#
#   sudo bash /srv/sublime/src/deploy/backup.sh
set -euo pipefail
umask 077

ROOT=/srv/sublime
STAMP=$(date +%Y%m%d-%H%M)
DEST="$ROOT/backups/$STAMP"
mkdir -p "$DEST"
cd "$ROOT"

DBS=$(docker compose -f compose.yaml exec -T postgres psql -U sublime_admin -d postgres -Atc \
  "SELECT datname FROM pg_database WHERE datname LIKE 'sublime_%' ORDER BY 1")
for db in $DBS; do
  docker compose -f compose.yaml exec -T postgres pg_dump -U sublime_admin -Fc "$db" > "$DEST/$db.dump"
done
docker compose -f compose.yaml exec -T postgres pg_dumpall -U sublime_admin --globals-only > "$DEST/globals.sql"
tar czf "$DEST/media.tgz" -C "$ROOT" media

find "$ROOT/backups" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
echo "✔ respaldo $STAMP: $(du -sh "$DEST" | cut -f1)"
