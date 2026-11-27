import Link from "next/link";
import p from "@/components/admin/products/list.module.css";
import { argentinaDateTime } from "@/components/admin/orders/detail-helpers";
import { Badge, type BadgeTone, cx, VisuallyHidden } from "@/components/admin/ui";
import { signedQuantity, variantOptionsLabel } from "@/server/inventory/admin-inventory";
import { movementActorLabel, movementLabel, type MovementKind } from "@/server/inventory/movement-view";
import type { InventoryMovement } from "@/server/inventory/movements";
import { orderNumber } from "@/server/orders/repository";
import s from "./list.module.css";

const KIND: Record<MovementKind, { label: string; tone: BadgeTone }> = {
  entrada: { label: "Entrada", tone: "success" },
  salida: { label: "Salida", tone: "info" },
  ajuste: { label: "Ajuste", tone: "warning" },
  reserva: { label: "Reserva", tone: "neutral" },
};

/** Explains "—" in the Pedido column; the table points to it (aria-describedby). */
export const ORDER_NOTE_ID = "movimientos-pedido";

/** Options of the moved variant, in the stored key order (the ledger has no product option order). */
const optionsOf = (options: Record<string, string>) => variantOptionsLabel(Object.keys(options), options);

/**
 * One page of the stock ledger, newest first, read-only. Dates are Argentina
 * time. The note drops below ~880px of list width and rows turn into cards
 * below ~600px (list.module.css).
 */
export function MovementsTable({ movements }: { movements: InventoryMovement[] }) {
  return (
    <table className={cx(p.table, s.table)} aria-describedby={ORDER_NOTE_ID}>
      <caption>
        <VisuallyHidden>Movimientos de stock</VisuallyHidden>
      </caption>
      <thead>
        <tr>
          <th scope="col" className={p.th}>
            Fecha
          </th>
          <th scope="col" className={p.th}>
            Producto
          </th>
          <th scope="col" className={p.th}>
            Tipo
          </th>
          <th scope="col" className={cx(p.th, s.number)}>
            Físico
          </th>
          <th scope="col" className={cx(p.th, s.number)}>
            Reservado
          </th>
          <th scope="col" className={cx(p.th, s.wideOnly)}>
            Motivo o nota
          </th>
          <th scope="col" className={p.th}>
            Responsable
          </th>
          <th scope="col" className={p.th}>
            Pedido
          </th>
        </tr>
      </thead>
      <tbody>
        {movements.map((movement) => {
          const kind = KIND[movement.kind];
          const options = optionsOf(movement.options);
          return (
            <tr key={movement.id} className={s.row}>
              <td className={cx(p.td, s.cell, s.date, s.corner)}>
                <time dateTime={movement.createdAt.toISOString()}>{argentinaDateTime(movement.createdAt)}</time>
              </td>
              <th scope="row" className={cx(p.td, s.cell, s.product, s.lead)}>
                <Link href={`/admin/inventario/${encodeURIComponent(movement.productId)}`} className={s.name}>
                  {movement.productName}
                </Link>
                <span className={p.meta}>
                  {options === "Única" ? movement.sku : `${options} · ${movement.sku}`}
                </span>
              </th>
              <td className={cx(p.td, s.cell)} data-label="Tipo">
                <span className={p.stockCell}>
                  <Badge tone={kind.tone}>{kind.label}</Badge>
                  <span className={p.meta}>{movementLabel(movement.reason)}</span>
                </span>
              </td>
              <td className={cx(p.td, s.cell, s.number)} data-label="Físico">
                <Delta value={movement.deltaOnHand} />
              </td>
              <td className={cx(p.td, s.cell, s.number)} data-label="Reservado">
                <Delta value={movement.deltaReserved} />
              </td>
              <td className={cx(p.td, s.cell, s.note, s.wideOnly)} data-label="Nota">
                {movement.note || <Empty label="Sin nota" />}
              </td>
              <td className={cx(p.td, s.cell)} data-label="Responsable">
                {movementActorLabel(movement.actor)}
              </td>
              <td className={cx(p.td, s.cell)} data-label="Pedido">
                {movement.order ? (
                  <Link href={`/admin/pedidos/${encodeURIComponent(movement.order.id)}`} className={s.link}>
                    {orderNumber(movement.order)}
                  </Link>
                ) : (
                  <Empty label="Sin pedido asociado" />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** "+4" / "−2"; zero is a dash read as "Sin cambio". */
function Delta({ value }: { value: number }) {
  if (value === 0) return <Empty label="Sin cambio" />;
  return <>{signedQuantity(value)}</>;
}

function Empty({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      <VisuallyHidden>{label}</VisuallyHidden>
    </>
  );
}
