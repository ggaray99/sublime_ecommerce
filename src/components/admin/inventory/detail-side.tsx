import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/admin/ui";
import { productStockState } from "@/server/admin/product-search";
import type { ActiveReservation, InventoryDetail } from "@/server/inventory/admin-detail";
import { reservationExpiryText, variantOptionsText } from "./detail-helpers";
import { STOCK_BADGE } from "./detail-variants";
import styles from "./detail.module.css";

/** Orders holding this product's stock right now (expired ones were released before reading). */
export function ReservationsCard({ reservations, optionNames }: { reservations: ActiveReservation[]; optionNames: readonly string[] }) {
  const units = reservations.reduce((sum, reservation) => sum + reservation.quantity, 0);
  return (
    <Card section id="reservas" title="Reservas activas">
      <div className={styles.body}>
        {reservations.length ? (
          <>
            <p className={styles.meta}>
              {units} {units === 1 ? "unidad reservada" : "unidades reservadas"} por pedidos pendientes de pago. Se liberan al vencer o al cancelar el pedido.
            </p>
            <ul className={styles.rows}>
              {reservations.map((reservation) => (
                <li key={reservation.id}>
                  <div className={styles.rowHead}>
                    <span className={styles.rowTitle}>
                      {reservation.order ? (
                        <Link href={`/admin/pedidos/${reservation.order.id}`}>Pedido SUB-{reservation.order.number}</Link>
                      ) : (
                        "Sin pedido asociado"
                      )}
                    </span>
                    <span>
                      {reservation.quantity} {reservation.quantity === 1 ? "unidad" : "unidades"}
                    </span>
                  </div>
                  <p className={styles.meta}>
                    {optionNames.length ? `${variantOptionsText(reservation.options, optionNames)} · ` : ""}
                    <span className={styles.sku}>{reservation.sku}</span> ·{" "}
                    <time dateTime={reservation.expiresAt.toISOString()}>{reservationExpiryText(reservation.expiresAt)}</time>
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState heading="No hay reservas activas." headingLevel={3}>
            <p>Cuando un cliente hace un pedido, las unidades quedan reservadas hasta que paga, vence la reserva o se cancela.</p>
          </EmptyState>
        )}
      </div>
    </Card>
  );
}

/** Product availability: totals of the active variants and the product's stock state (same rule as Productos). */
export function AvailabilityCard({ detail }: { detail: InventoryDetail }) {
  const state = STOCK_BADGE[productStockState({ trackStock: detail.trackStock, ...detail.totals, lowStockThreshold: detail.threshold })];
  return (
    <Card section id="disponibilidad" title="Disponibilidad">
      <div className={styles.body}>
        {detail.trackStock ? (
          <>
            <p className={styles.text}>
              <Badge tone={state.tone}>{state.label}</Badge>
            </p>
            <dl className={styles.facts}>
              <div>
                <dt>Físico</dt>
                <dd>{detail.totals.onHand}</dd>
              </div>
              <div>
                <dt>Reservado</dt>
                <dd>{detail.totals.reserved}</dd>
              </div>
              <div>
                <dt>Disponible</dt>
                <dd>{detail.totals.available}</dd>
              </div>
            </dl>
            <p className={styles.meta}>
              Suma de las variantes activas. Stock bajo: hasta {detail.threshold} {detail.threshold === 1 ? "unidad disponible" : "unidades disponibles"}
              {detail.lowStockThreshold === null ? " (umbral por defecto)" : ""}.
            </p>
          </>
        ) : (
          <p className={styles.muted}>A pedido: no lleva stock.</p>
        )}
      </div>
    </Card>
  );
}
