import type { QueryFn } from "../db/client.ts";

/**
 * Notification outbox. Rows are written in the same statement as what they
 * announce (see custom requests); this processor delivers them later and
 * retries with backoff, so a failing channel never loses or blocks an order.
 *
 * Channel today: an optional webhook (NOTIFY_WEBHOOK_URL, e.g. an n8n workflow
 * that forwards to WhatsApp or Telegram). Without a channel, rows stay pending.
 */

export const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 15, 60, 240];

export type OutboxRow = { id: number; kind: string; payload: Record<string, unknown>; attempts: number };

export function createOutboxRepository(sql: QueryFn) {
  return {
    /** Takes due pending rows (at most `limit`); SKIP LOCKED keeps two runs from sending twice. */
    async claim(limit = 20): Promise<OutboxRow[]> {
      const rows = (await sql.query(
        `UPDATE notification_outbox SET next_attempt_at = now() + interval '2 minutes'
         WHERE id IN (
           SELECT id FROM notification_outbox
           WHERE status = 'pending' AND next_attempt_at <= now()
           ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED
         )
         RETURNING id, kind, payload, attempts`,
        [limit],
      )) as OutboxRow[];
      // RETURNING has no order: deliver oldest first.
      return rows.sort((a, b) => a.id - b.id);
    },

    async sent(id: number): Promise<void> {
      await sql.query("UPDATE notification_outbox SET status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1", [id]);
    },

    async failed(row: OutboxRow, error: string): Promise<void> {
      const attempts = row.attempts + 1;
      await sql.query(
        `UPDATE notification_outbox
         SET attempts = $2::int, last_error = $3::text,
             status = CASE WHEN $2::int >= $4::int THEN 'failed' ELSE 'pending' END,
             next_attempt_at = now() + ($5::text || ' minutes')::interval
         WHERE id = $1`,
        [row.id, attempts, error.slice(0, 500), MAX_ATTEMPTS, String(BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length) - 1])],
      );
    },

    async counts(): Promise<Record<string, number>> {
      const rows = (await sql.query("SELECT status, count(*)::int AS n FROM notification_outbox GROUP BY status")) as { status: string; n: number }[];
      return Object.fromEntries(rows.map((r) => [r.status, r.n]));
    },
  };
}

export type Deliver = (row: OutboxRow) => Promise<void>;

/** Webhook delivery (JSON POST); throws on a non-2xx answer so the row is retried. */
export function webhookDeliver(url: string, fetchImpl: typeof fetch = fetch): Deliver {
  return async (row) => {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, kind: row.kind, payload: row.payload }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  };
}

/** One processing run: deliver what is due, record the outcome of each row. */
export async function processOutbox(repo: ReturnType<typeof createOutboxRepository>, deliver: Deliver | null) {
  if (!deliver) return { sent: 0, failed: 0, skipped: "sin canal configurado" as const };
  let sent = 0;
  let failed = 0;
  for (const row of await repo.claim()) {
    try {
      await deliver(row);
      await repo.sent(row.id);
      sent++;
    } catch (error) {
      await repo.failed(row, (error as Error).message || "error");
      failed++;
    }
  }
  return { sent, failed };
}
