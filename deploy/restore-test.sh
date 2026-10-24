#!/usr/bin/env bash
# Proves the latest backup restores: loads each dump into a throwaway database,
# compares row counts of key tables with the live database, then drops it.
#
#   sudo bash /srv/sublime/src/deploy/restore-test.sh
set -euo pipefail

ROOT=/srv/sublime
cd "$ROOT"
LATEST=$(ls -1d backups/*/ | sort | tail -1)
PSQL=(docker compose -f compose.yaml exec -T postgres psql -U sublime_admin -v ON_ERROR_STOP=1 -Atq)
COUNT="SELECT (SELECT count(*) FROM products)||'/'||(SELECT count(*) FROM orders)||'/'||(SELECT count(*) FROM auth_users)||'/'||(SELECT count(*) FROM schema_migrations)"

echo "Respaldo: $LATEST"
for dump in "$LATEST"*.dump; do
  db=$(basename "$dump" .dump)
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS restore_test" -c "CREATE DATABASE restore_test"
  START=$(date +%s)
  docker compose -f compose.yaml exec -T postgres pg_restore -U sublime_admin -d restore_test --no-owner < "$dump"
  SECS=$(( $(date +%s) - START ))
  live=$("${PSQL[@]}" -d "$db" -c "$COUNT")
  restored=$("${PSQL[@]}" -d restore_test -c "$COUNT")
  "${PSQL[@]}" -d postgres -c "DROP DATABASE restore_test"
  echo "$db: productos/pedidos/cuentas/migraciones en vivo=$live restaurado=$restored (${SECS}s)"
  [ "$live" = "$restored" ] || { echo "✖ $db no coincide (puede haber cambiado desde el respaldo)"; exit 1; }
done
tar tzf "$LATEST/media.tgz" >/dev/null && echo "✔ archivos: media.tgz legible"
echo "✔ restauración probada"
