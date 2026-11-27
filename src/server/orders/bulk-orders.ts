import { OrderError, orderNumber, type OrderRepository } from "./repository.ts";

/** One list page: bulk changes apply to what the person can see and check. */
export const MAX_BULK_ORDERS = 50;

const TOO_MANY = `Podés cambiar hasta ${MAX_BULK_ORDERS} pedidos por vez.`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BulkOrderItem = { id: string; number: string };
export type FulfillResult = {
  changed: BulkOrderItem[];
  /** Not delivered, with the reason the order page would give; `number` is null when the order does not exist. */
  skipped: { id: string; number: string | null; reason: string }[];
};

export type FulfillInput = { ok: true; ids: string[] } | { ok: false; error: string };

/** Validates what the browser sends: 1..MAX_BULK_ORDERS order ids (UUIDs), deduplicated. */
export function parseFulfillInput(input: unknown): FulfillInput {
  const ids = (input as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(ids) || !ids.length || !ids.every((id) => typeof id === "string" && UUID.test(id))) {
    return { ok: false, error: "Elegí al menos un pedido." };
  }
  const unique = [...new Set((ids as string[]).map((id) => id.toLowerCase()))];
  if (unique.length > MAX_BULK_ORDERS) return { ok: false, error: TOO_MANY };
  return { ok: true, ids: unique };
}

/**
 * "Marcar entregado" on many orders. Each one goes through the existing
 * per-order markFulfilled, which decides whether the transition is allowed
 * and writes its history row; an order it refuses is skipped with its message
 * and the rest still apply.
 */
export async function fulfillOrders(
  repo: Pick<OrderRepository, "getOrder" | "markFulfilled">,
  actor: string,
  ids: readonly string[],
): Promise<FulfillResult> {
  const unique = [...new Set(ids)];
  if (unique.length > MAX_BULK_ORDERS) throw new RangeError(TOO_MANY);
  const result: FulfillResult = { changed: [], skipped: [] };
  for (const id of unique) {
    let number: string | null = null;
    try {
      number = orderNumber(await repo.getOrder(id));
      await repo.markFulfilled(actor, id, "");
      result.changed.push({ id, number });
    } catch (error) {
      if (!(error instanceof OrderError)) throw error;
      if (error.code === "not_found") {
        result.skipped.push({ id, number: null, reason: "El pedido no existe." });
      } else {
        result.skipped.push({ id, number, reason: error.message || "Solo pedidos enviados, o pagados con retiro, se pueden marcar entregados." });
      }
    }
  }
  return result;
}

/** The toast after a bulk "Marcar entregado": how many changed, and each skipped order with its reason. */
export function fulfillResultMessage(result: FulfillResult): { message: string; tone: "success" | "info" | "warning" | "critical" } {
  const changed = result.changed.length;
  const parts = [
    changed
      ? `${changed} ${changed === 1 ? "pedido marcado como entregado" : "pedidos marcados como entregados"}.`
      : "Ningún pedido marcado como entregado.",
  ];
  const skipped = result.skipped.length;
  if (skipped) {
    const reasons = result.skipped
      .map((item) => (item.number ? `${item.number} (${item.reason.replace(/\.$/, "")})` : "un pedido que ya no existe"))
      .join("; ");
    parts.push(`${skipped} ${skipped === 1 ? "no se pudo" : "no se pudieron"}: ${reasons}.`);
  }
  const tone = skipped ? (changed ? "warning" : "critical") : changed ? "success" : "info";
  return { message: parts.join(" "), tone };
}
