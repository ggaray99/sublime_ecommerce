#!/usr/bin/env bash
# Daily backup of every Sublime database and the media folders: 14 days in
# /srv/sublime/backups and an encrypted off-site copy in Google Drive
# (rclone remote gcrypt: → Drive folder sublime-backups), kept 60 days.
# Run by cron (/etc/cron.d/sublime-backup). Restoring from Drive needs the
# passwords in backup-crypt-password.txt and backup-crypt-salt.txt.
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

RCLONE=(rclone --config "$ROOT/rclone.conf")
if [ -f "$ROOT/rclone.conf" ]; then
  "${RCLONE[@]}" copy "$DEST" "gcrypt:$STAMP"
  "${RCLONE[@]}" delete --min-age 60d gcrypt:
  "${RCLONE[@]}" rmdirs --leave-root gcrypt:
  echo "✔ copia cifrada en Google Drive: $STAMP"
else
  echo "✖ sin copia externa: falta $ROOT/rclone.conf"
  exit 1
fi
