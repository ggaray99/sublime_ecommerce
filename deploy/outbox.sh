#!/usr/bin/env bash
# Delivers pending notifications (outbox) by calling the app's internal route
# from inside the container. Run every minute by cron (/etc/cron.d/sublime-outbox).
# The route answers only with OUTBOX_TOKEN (staging.env) and sends to
# NOTIFY_WEBHOOK_URL when it is set; without it, notifications stay pending.
set -euo pipefail

docker exec sublime-staging-1 node -e '
fetch("http://127.0.0.1:3000/api/internal/outbox", {
  method: "POST",
  headers: { authorization: "Bearer " + process.env.OUTBOX_TOKEN },
})
  .then((r) => r.text())
  .then((t) => console.log(new Date().toISOString(), t))
  .catch((e) => console.log(new Date().toISOString(), String(e)));
'
