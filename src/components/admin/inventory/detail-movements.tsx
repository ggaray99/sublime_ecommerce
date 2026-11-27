import Link from "next/link";
import { ArgentinaTime } from "@/components/admin/orders/detail-cards";
import { Badge, type BadgeTone } from "@/components/admin/ui";
import type { InventoryMovement } from "@/server/inventory/movements";
import { movementActorLabel, movementLabel, type MovementKind } from "@/server/inventory/movement-view";
import { signedDelta, variantOptionsText } from "./detail-helpers";
import styles from "./detail.module.css";

const KIND_BADGE: Record<MovementKind, { label: string; tone: BadgeTone }> = {
  entrada: { label: "Entrada", tone: "success" },
  salida: { label: "Salida", tone: "info" },
  ajuste: { label: "Ajuste", tone: "warning" },
  reserva: { label: "Reserva", tone: "neutral" },
};

type Props = {
  movements: InventoryMovement[];
  /** The product's option names, to name variants ("Talle M"); empty for single-variant products. */
  optionNames: readonly string[];
  empty?: string;
};

/**
 * Inventory movements, newest first: kind and reason, physical and reserved
 * deltas, Argentina time, variant, readable responsible, note and the order.
 * Shared by the inventory detail and the product page (read-only).
 */
export function MovementRows({ movements, optionNames, empty = "Sin movimientos registrados." }: Props) {
  if (!movements.length) {
    return (
      <div className={styles.body}>
        <p className={styles.muted}>{empty}</p>
      </div>
    );
  }
  return (
    <div className={styles.body}>
      <ol className={styles.rows} aria-label="Movimientos de stock">
        {movements.map((movement) => {
          const kind = KIND_BADGE[movement.kind];
          const variant = optionNames.length ? `${variantOptionsText(movement.options, optionNames)} · ` : "";
          return (
            <li key={movement.id}>
              <div className={styles.rowHead}>
                <span className={styles.rowTitle}>
                  <Badge tone={kind.tone}>{kind.label}</Badge>
                  {movementLabel(movement.reason)}
                </span>
                <dl className={styles.deltas}>
                  <div>
                    <dt>Físico</dt>
                    <dd>{signedDelta(movement.deltaOnHand)}</dd>
                  </div>
                  <div>
                    <dt>Reservado</dt>
                    <dd>{signedDelta(movement.deltaReserved)}</dd>
                  </div>
                </dl>
              </div>
              <p className={styles.meta}>
                <ArgentinaTime date={movement.createdAt} /> · {variant}
                <span className={styles.sku}>{movement.sku}</span> · {movementActorLabel(movement.actor)}
                {movement.order && (
                  <>
                    {" · "}
                    <Link href={`/admin/pedidos/${movement.order.id}`}>Pedido SUB-{movement.order.number}</Link>
                  </>
                )}
              </p>
              {movement.note && <p className={styles.text}>{movement.note}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
