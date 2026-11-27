/*
 * How the admin reads the inventory ledger (inventory_movements). Display only:
 * the stored reasons and actors are not changed. See docs/admin-inventory-audit.md.
 */

export type MovementKind = "entrada" | "salida" | "ajuste" | "reserva";

const KIND: Record<string, MovementKind> = {
  initial_count: "entrada",
  restock: "entrada",
  adjustment: "ajuste",
  sale: "salida",
  reservation_created: "reserva",
  reservation_released: "reserva",
  reservation_expired: "reserva",
};

const LABEL: Record<string, string> = {
  initial_count: "Carga inicial",
  restock: "Reposición",
  adjustment: "Ajuste",
  sale: "Venta",
  reservation_created: "Reserva por pedido",
  reservation_released: "Reserva liberada (pedido cancelado)",
  reservation_expired: "Reserva vencida",
};

/** Entradas add physical stock, salidas are sales, reservas only move the reserved count. */
export const movementKind = (reason: string): MovementKind => KIND[reason] ?? "ajuste";

export const movementLabel = (reason: string): string => LABEL[reason] ?? reason;

/** Filter values (?tipo=) and the reasons each one selects. */
export const MOVEMENT_KINDS: { value: string; label: string; kind: MovementKind; reasons: string[] }[] = [
  { value: "entradas", label: "Entradas", kind: "entrada", reasons: ["initial_count", "restock"] },
  { value: "salidas", label: "Salidas (ventas)", kind: "salida", reasons: ["sale"] },
  { value: "ajustes", label: "Ajustes", kind: "ajuste", reasons: ["adjustment"] },
  { value: "reservas", label: "Reservas", kind: "reserva", reasons: ["reservation_created", "reservation_released", "reservation_expired"] },
];

const ACTORS: Record<string, string> = {
  checkout: "Checkout de la tienda",
  system: "Sistema (vencimiento automático)",
  mercadopago: "Mercado Pago",
  seed: "Carga inicial del catálogo",
};

/** Who made a movement, readable; admin emails stay as they are. */
export function movementActorLabel(actor: string): string {
  if (actor.startsWith("integration:")) return `Integración: ${actor.slice("integration:".length)}`;
  return ACTORS[actor] ?? actor;
}
