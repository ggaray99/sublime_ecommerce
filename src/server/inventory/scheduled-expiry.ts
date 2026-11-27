import type { OrderRepository } from "../orders/repository.ts";

export type ExpiryRun = { reservations: number; orders: number } | { error: string };

/**
 * Scheduled release of expired reservations (docs/inventory-stabilization.md, 7).
 * Run every minute by the VPS cron through the protected internal route; the
 * same releaseExpired still runs when the panel, cart and checkout load. It is
 * idempotent: only active reservations past their expiry are touched, each in a
 * row-locked statement, so two runs at once release every reservation once.
 * Movements are recorded with actor "system". Errors are returned (and logged by
 * the caller), never thrown, so the rest of the cron run continues.
 */
export async function runScheduledExpiry(repo: Pick<OrderRepository, "releaseExpired">): Promise<ExpiryRun> {
  try {
    return await repo.releaseExpired();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "unknown error" };
  }
}
