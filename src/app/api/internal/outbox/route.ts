import { timingSafeEqual } from "node:crypto";
import { getSql, hasDatabase } from "@/server/db/client";
import { createOutboxRepository, processOutbox, webhookDeliver } from "@/server/notifications/outbox";
import { enqueueLowStock } from "@/server/notifications/stock-alerts";

const notFound = () => new Response("No encontrado", { status: 404 });

/** Constant-time token check: the route only answers the VPS cron. */
function authorized(request: Request): boolean {
  const expected = process.env.OUTBOX_TOKEN;
  if (!expected || expected.length < 32) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Delivers pending notifications (called every minute by the VPS cron). */
export async function POST(request: Request) {
  if (!hasDatabase() || !authorized(request)) return notFound();
  // Low stock is checked here too, so one cron covers it.
  const lowStock = await enqueueLowStock(getSql());
  const repo = createOutboxRepository(getSql());
  const url = process.env.NOTIFY_WEBHOOK_URL;
  const result = await processOutbox(repo, url ? webhookDeliver(url) : null);
  return Response.json({ ...result, lowStock, counts: await repo.counts() }, { headers: { "Cache-Control": "no-store" } });
}
