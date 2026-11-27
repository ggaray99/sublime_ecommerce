#!/usr/bin/env bash
# Calls the app's internal route from inside each running container (staging and
# the store): releases expired stock reservations, delivers pending notifications
# (outbox), queues low-stock alerts and
# asks Mercado Pago about payments whose notice was lost. Run every minute by cron
# (/etc/cron.d/sublime-outbox). The route answers only with OUTBOX_TOKEN (from
# staging.env / production.env) and sends to NOTIFY_WEBHOOK_URL when it is set;
# without it, notifications stay pending. A container that is not running is
# skipped, and one failing never stops the other.
set -uo pipefail

for container in sublime-staging-1 sublime-production-1; do
  [ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null)" = "true" ] || continue
  docker exec "$container" node -e '
fetch("http://127.0.0.1:3000/api/internal/outbox", {
  method: "POST",
  headers: { authorization: "Bearer " + process.env.OUTBOX_TOKEN },
})
  .then((r) => r.text())
  .then((t) => console.log(new Date().toISOString(), process.argv[1], t))
  .catch((e) => console.log(new Date().toISOString(), process.argv[1], String(e)));
' "$container" || echo "$(date -u +%FT%TZ) $container: docker exec failed"
done
