import type { Delivery, OrderStatus } from "./repository.ts";

/*
 * Orders have ONE status (orders.status). The panel shows it split in two
 * views, payment and delivery, so they read like Shopify's payment and
 * fulfilment states. These are display mappings only: no new state is stored,
 * and every filter translates back to existing statuses.
 */

export type PaymentState = "pending" | "paid" | "review" | "expired" | "cancelled";
export type DeliveryState = "to_ship" | "to_pick_up" | "shipped" | "delivered" | "none";
type DeliveryMethod = Delivery["method"];

/** pending_payment waits for the payment; paid, shipped and fulfilled were paid. */
export function orderPaymentState(status: OrderStatus): PaymentState {
  switch (status) {
    case "pending_payment":
      return "pending";
    case "paid":
    case "shipped":
    case "fulfilled":
      return "paid";
    case "needs_review":
      // Paid after the reservation expired, with not enough stock left.
      return "review";
    case "expired":
      return "expired";
    case "cancelled":
      return "cancelled";
  }
}

/** Delivery only applies once the order is paid and not under review. */
export function orderDeliveryState(status: OrderStatus, method: DeliveryMethod): DeliveryState {
  switch (status) {
    case "paid":
      return method === "shipping" ? "to_ship" : "to_pick_up";
    case "shipped":
      return "shipped";
    case "fulfilled":
      return "delivered";
    default:
      return "none";
  }
}

export type StateTone = "neutral" | "info" | "success" | "warning" | "critical" | "attention";

export const PAYMENT_STATE: Record<PaymentState, { label: string; tone: StateTone }> = {
  pending: { label: "Pago pendiente", tone: "warning" },
  paid: { label: "Pagado", tone: "success" },
  review: { label: "Pagado · en revisión", tone: "critical" },
  expired: { label: "Vencido sin pago", tone: "neutral" },
  cancelled: { label: "Cancelado", tone: "neutral" },
};

export const DELIVERY_STATE: Record<DeliveryState, { label: string; tone: StateTone }> = {
  to_ship: { label: "Sin enviar", tone: "attention" },
  to_pick_up: { label: "Para retirar", tone: "attention" },
  shipped: { label: "Enviado", tone: "info" },
  delivered: { label: "Entregado", tone: "success" },
  none: { label: "No corresponde", tone: "neutral" },
};

/** URL values of the "Pago" filter (?pago=). */
export const PAYMENT_FILTERS: { value: string; label: string; state: PaymentState }[] = [
  { value: "pendiente", label: "Pago pendiente", state: "pending" },
  { value: "pagado", label: "Pagado", state: "paid" },
  { value: "revision", label: "En revisión", state: "review" },
  { value: "vencido", label: "Vencido sin pago", state: "expired" },
  { value: "cancelado", label: "Cancelado", state: "cancelled" },
];

/** URL values of the "Entrega" filter (?entrega=). */
export const DELIVERY_FILTERS: { value: string; label: string; state: DeliveryState }[] = [
  { value: "sin-enviar", label: "Sin enviar", state: "to_ship" },
  { value: "para-retirar", label: "Para retirar", state: "to_pick_up" },
  { value: "enviado", label: "Enviado", state: "shipped" },
  { value: "entregado", label: "Entregado", state: "delivered" },
];

const ALL: readonly OrderStatus[] = ["pending_payment", "paid", "shipped", "fulfilled", "cancelled", "expired", "needs_review"];

export type StatusFilter = { statuses: OrderStatus[]; method?: DeliveryMethod };

/** The statuses a "Pago" filter value selects; null for an unknown value. */
export function paymentFilterOf(value: string | undefined): StatusFilter | null {
  const filter = PAYMENT_FILTERS.find((item) => item.value === value);
  return filter ? { statuses: ALL.filter((status) => orderPaymentState(status) === filter.state) } : null;
}

/** The statuses (and delivery method, when it matters) an "Entrega" filter value selects. */
export function deliveryFilterOf(value: string | undefined): StatusFilter | null {
  const filter = DELIVERY_FILTERS.find((item) => item.value === value);
  if (!filter) return null;
  switch (filter.state) {
    case "to_ship":
      return { statuses: ["paid"], method: "shipping" };
    case "to_pick_up":
      return { statuses: ["paid"], method: "pickup" };
    case "shipped":
      return { statuses: ["shipped"] };
    case "delivered":
      return { statuses: ["fulfilled"] };
    default:
      return null;
  }
}
