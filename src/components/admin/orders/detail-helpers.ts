import type { Delivery, Order, OrderEvent, OrderItem, OrderStatus } from "../../../server/orders/repository.ts";
import { DELIVERY_STATE, orderDeliveryState, orderPaymentState, PAYMENT_STATE, type PaymentState, type StateTone } from "../../../server/orders/status-view.ts";

/*
 * Pure rules of the admin order detail page (tested in
 * tests/admin-order-detail.test.mjs). Display only: no state or transition
 * lives here; the server action and the repository keep the rules.
 */

type DeliveryMethod = Delivery["method"];

const ACTORS: Record<string, string> = {
  checkout: "Checkout de la tienda",
  system: "Sistema (vencimiento automático)",
  mercadopago: "Mercado Pago",
};

/** Who made an order event, readable; admin emails stay as they are. */
export const actorLabel = (actor: string): string => ACTORS[actor] ?? actor;

const ORDER_STATUS_SET = new Set<string>(["pending_payment", "paid", "shipped", "fulfilled", "cancelled", "expired", "needs_review"]);

/** Tone of an event by its target status: delivery steps use the delivery view, the rest the payment view. */
export function eventTone(status: string, method: DeliveryMethod): StateTone {
  if (!ORDER_STATUS_SET.has(status)) return "neutral";
  const known = status as OrderStatus;
  if (known === "shipped" || known === "fulfilled") return DELIVERY_STATE[orderDeliveryState(known, method)].tone;
  return PAYMENT_STATE[orderPaymentState(known)].tone;
}

export type OrderTimelineEntry = {
  id: string;
  label: string;
  previousLabel: string | null;
  actor: string;
  note: string;
  time: Date;
  tone: StateTone;
};

/** The order events for the Timeline, newest first (the repository returns them oldest first). */
export function orderTimelineEntries(events: readonly OrderEvent[], method: DeliveryMethod, labels: Record<string, string>): OrderTimelineEntry[] {
  const name = (status: string) => labels[status] ?? status;
  return events
    .map((event, index) => ({
      id: `${index}-${event.createdAt.getTime()}`,
      label: name(event.toStatus),
      previousLabel: event.fromStatus ? name(event.fromStatus) : null,
      actor: actorLabel(event.actor),
      note: event.note,
      time: event.createdAt,
      tone: eventTone(event.toStatus, method),
    }))
    .reverse();
}

/** What the customer chose at checkout. */
export const paymentPreferenceLabel = (preference: Order["paymentPreference"]): string =>
  preference === "transfer" ? "Transferencia" : "Mercado Pago o transferencia";

// Checkout Pro (Orders API) and classic payment statuses, as stored in payments.status.
const MERCADOPAGO_STATUS: Record<string, string> = {
  approved: "Aprobado",
  processed: "Aprobado",
  pending: "Pendiente",
  created: "Iniciado",
  in_process: "En proceso",
  processing: "En proceso",
  action_required: "Requiere acción del cliente",
  rejected: "Rechazado",
  failed: "Rechazado",
  cancelled: "Cancelado",
  canceled: "Cancelado",
  expired: "Vencido",
  refunded: "Devuelto",
  charged_back: "Contracargo",
};

/** A Mercado Pago payment status in Spanish; unknown values are shown as stored. */
export const mercadoPagoStatusLabel = (status: string): string => MERCADOPAGO_STATUS[status] ?? status;

/** Tone of a Mercado Pago payment row. */
export function mercadoPagoStatusTone(status: string): StateTone {
  if (status === "approved" || status === "processed") return "success";
  if (status === "rejected" || status === "failed" || status === "charged_back") return "critical";
  if (status === "pending" || status === "in_process" || status === "processing" || status === "action_required" || status === "created") return "warning";
  return "neutral";
}

/** Argentina has no DST: UTC−3 all year. "dd/mm/aaaa HH:MM". */
export function argentinaDateTime(date: Date): string {
  const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const [day, time] = local.toISOString().split("T");
  return `${day.split("-").reverse().join("/")} ${time.slice(0, 5)}`;
}

/** Deadline of a pending order's stock reservation: "Reserva hasta dd/mm HH:MM". */
export function reservationText(expiresAt: Date): string {
  const [date, time] = argentinaDateTime(expiresAt).split(" ");
  return `Reserva hasta ${date.slice(0, 5)} ${time}`;
}

/** What each payment state means for the person handling the order (needs_review has its own callout). */
export const PAYMENT_EXPLANATION: Record<PaymentState, string> = {
  pending: "Todavía no se registró el pago. El stock queda reservado hasta que venza la reserva.",
  paid: "El pago está confirmado y el stock reservado pasó a venta.",
  review: "El pago llegó después de que venció la reserva y no alcanzó el stock.",
  expired: "La reserva venció sin pago y el stock se liberó. Si el pago llegó igual, podés confirmarlo como pago tardío.",
  cancelled: "El pedido está cancelado: no se espera ningún pago.",
};

/** Options of a line, as the order summary shows them: design lines ("Design · Kind") list them apart; named combos do not. */
export function lineOptionsText(item: Pick<OrderItem, "name" | "designId" | "options">): string | null {
  const entries = Object.entries(item.options);
  if (!entries.length || (!item.designId && item.name.includes("·"))) return null;
  return entries.map(([name, value]) => `${name} ${value}`).join(" · ");
}

/** Shipping row wording of the order summary; null means "show the amount". */
export function shippingCostLabel(order: { shippingMinor: number | null; delivery: Pick<Delivery, "method">; shipping: Pick<NonNullable<Order["shipping"]>, "free"> | null }): string | null {
  if (order.shippingMinor === null) return order.delivery.method === "shipping" ? "A confirmar" : "Sin cargo";
  if (order.shippingMinor === 0) return order.shipping?.free ? "Gratis" : "Sin cargo";
  return null;
}

export type OrderIntent = "confirm" | "cancel" | "ship" | "fulfill";
export type OrderActionOption = { intent: OrderIntent; label: string };

const CANCEL: OrderActionOption = { intent: "cancel", label: "Cancelar pedido" };
const FULFILL: OrderActionOption = { intent: "fulfill", label: "Marcar entregado" };

/** The actions each status allows (same as the repository's transitions); shipping orders go out with tracking before being delivered. */
export function orderActionsFor(status: OrderStatus, method: DeliveryMethod): OrderActionOption[] {
  switch (status) {
    case "pending_payment":
      return [{ intent: "confirm", label: "Confirmar pago" }, CANCEL];
    case "expired":
      return [{ intent: "confirm", label: "Confirmar pago tardío" }, CANCEL];
    case "needs_review":
      return [CANCEL];
    case "paid":
      return method === "shipping" ? [{ intent: "ship", label: "Marcar enviado" }] : [FULFILL];
    case "shipped":
      return [FULFILL];
    case "fulfilled":
    case "cancelled":
      return [];
  }
}
