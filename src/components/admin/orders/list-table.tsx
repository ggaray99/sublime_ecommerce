import Link from "next/link";
import p from "@/components/admin/products/list.module.css";
import { RowCheckbox, SelectAllCheckbox } from "@/components/admin/selectable-table";
import { Badge, cx, VisuallyHidden } from "@/components/admin/ui";
import { argentinaTime } from "@/components/orders/order-view";
import { formatPrice } from "@/lib/format";
import { orderNumber, orderTotalMinor, type Order } from "@/server/orders/repository";
import { DELIVERY_STATE, orderDeliveryState, orderPaymentState, PAYMENT_STATE } from "@/server/orders/status-view";
import s from "./list.module.css";

/** "dd/mm HH:MM" in Argentina time. */
const shortTime = (date: Date) => {
  const [day, time] = argentinaTime(date).split(" ");
  return `${day.slice(0, 5)} ${time}`;
};

function PaymentCell({ order }: { order: Order }) {
  const state = PAYMENT_STATE[orderPaymentState(order.status)];
  return (
    <span className={s.state}>
      <Badge tone={state.tone}>{state.label}</Badge>
      {order.status === "pending_payment" && <span className={p.meta}>reserva hasta {shortTime(order.expiresAt)}</span>}
    </span>
  );
}

function DeliveryCell({ order }: { order: Order }) {
  const state = orderDeliveryState(order.status, order.delivery.method);
  const method = order.delivery.method === "shipping" ? `Envío · ${order.delivery.address.city}` : "Retiro";
  return (
    <span className={s.state}>
      {state === "none" ? (
        // Not paid (or under review): nothing to deliver yet, so no badge competes with the payment one.
        <span className={p.meta}>{DELIVERY_STATE.none.label}</span>
      ) : (
        <Badge tone={DELIVERY_STATE[state].tone}>{DELIVERY_STATE[state].label}</Badge>
      )}
      <span className={p.meta}>{method}</span>
    </span>
  );
}

/**
 * The orders of one page. A server component: only the checkboxes read the
 * selection (client). Second lines drop and rows turn into cards by the
 * list's width (list.module.css).
 */
export function OrderListTable({ orders }: { orders: Order[] }) {
  return (
    <table className={cx(p.table, s.table)}>
      <caption>
        <VisuallyHidden>Pedidos</VisuallyHidden>
      </caption>
      <thead>
        <tr>
          <th scope="col" className={cx(p.th, p.select)}>
            <SelectAllCheckbox />
          </th>
          <th scope="col" className={p.th}>
            Pedido
          </th>
          <th scope="col" className={p.th}>
            Cliente
          </th>
          <th scope="col" className={p.th}>
            Pago
          </th>
          <th scope="col" className={p.th}>
            Entrega
          </th>
          <th scope="col" className={cx(p.th, s.total)}>
            Total
          </th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => {
          const number = orderNumber(order);
          return (
            <tr key={order.id} className={cx(s.row, order.status === "needs_review" && s.critical)}>
              <td className={cx(p.td, p.select, s.cell, s.selectCell)}>
                <RowCheckbox id={order.id} label={number} />
              </td>
              <th scope="row" className={cx(p.td, s.cell, s.order)}>
                <Link href={`/admin/pedidos/${order.id}`} className={s.number}>
                  {number}
                </Link>
                <span className={cx(p.meta, s.secondary)}>{argentinaTime(order.createdAt)}</span>
              </th>
              <td className={cx(p.td, s.cell, s.customer)}>
                <span className={s.customerName}>{order.contactName}</span>
                <span className={cx(p.meta, s.secondary)}>{order.contactEmail}</span>
              </td>
              <td className={cx(p.td, s.cell, s.payment)}>
                <PaymentCell order={order} />
              </td>
              <td className={cx(p.td, s.cell, s.delivery)}>
                <DeliveryCell order={order} />
              </td>
              <td className={cx(p.td, s.cell, s.total)}>{formatPrice(orderTotalMinor(order) / 100)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
