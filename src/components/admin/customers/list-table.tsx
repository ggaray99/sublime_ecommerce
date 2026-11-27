import Link from "next/link";
import p from "@/components/admin/products/list.module.css";
import { Badge, cx, VisuallyHidden } from "@/components/admin/ui";
import { argentinaTime } from "@/components/orders/order-view";
import { formatPrice } from "@/lib/format";
import type { CustomerSummary } from "@/server/customers/admin";
import s from "./list.module.css";

/** "dd/mm/aaaa" in Argentina time: the list needs the day, not the hour. */
const argentinaDate = (date: Date) => argentinaTime(date).split(" ")[0];

/** Explains the "Total pagado" column; the table points to it (aria-describedby). */
export const TOTAL_NOTE_ID = "clientes-total-pagado";

/**
 * The accounts of one page. A server component with no selection: there are
 * no customer actions. Phone and encargos drop below ~880px of list width and
 * rows turn into cards below ~600px (list.module.css).
 */
export function CustomerListTable({ customers }: { customers: CustomerSummary[] }) {
  return (
    <table className={cx(p.table, s.table)} aria-describedby={TOTAL_NOTE_ID}>
      <caption>
        <VisuallyHidden>Clientes con cuenta</VisuallyHidden>
      </caption>
      <thead>
        <tr>
          <th scope="col" className={p.th}>
            Cliente
          </th>
          <th scope="col" className={cx(p.th, s.phone)}>
            Teléfono
          </th>
          <th scope="col" className={cx(p.th, s.number)}>
            Pedidos
          </th>
          <th scope="col" className={cx(p.th, s.number, s.requests)}>
            Encargos
          </th>
          <th scope="col" className={cx(p.th, s.money)}>
            Total pagado
          </th>
          <th scope="col" className={p.th}>
            Alta
          </th>
          <th scope="col" className={p.th}>
            Último pedido
          </th>
        </tr>
      </thead>
      <tbody>
        {customers.map((customer) => (
          <tr key={customer.authUserId} className={s.row}>
            <th scope="row" className={cx(p.td, s.cell, s.customer)}>
              <span className={s.nameLine}>
                <Link href={`/admin/clientes/${encodeURIComponent(customer.authUserId)}`} className={s.name}>
                  {customer.name || customer.email}
                </Link>
                {customer.isAdmin && <Badge tone="info">Admin</Badge>}
              </span>
              {customer.name && <span className={p.meta}>{customer.email}</span>}
            </th>
            <td className={cx(p.td, s.cell, s.phone)} data-label="Teléfono">
              {customer.phone ? (
                <a href={`tel:${customer.phone.replace(/[^0-9+]/g, "")}`} className={s.link}>
                  {customer.phone}
                </a>
              ) : (
                <>
                  <span aria-hidden="true">—</span>
                  <VisuallyHidden>Sin teléfono</VisuallyHidden>
                </>
              )}
            </td>
            <td className={cx(p.td, s.cell, s.number)} data-label="Pedidos">
              {customer.orderCount}
              {customer.paidOrderCount !== customer.orderCount && (
                <span className={p.meta}>
                  {customer.paidOrderCount} {customer.paidOrderCount === 1 ? "pagado" : "pagados"}
                </span>
              )}
            </td>
            <td className={cx(p.td, s.cell, s.number, s.requests)} data-label="Encargos">
              {customer.requestCount}
            </td>
            <td className={cx(p.td, s.cell, s.money)} data-label="Total pagado">
              {customer.spentMinor ? formatPrice(customer.spentMinor / 100) : "—"}
            </td>
            <td className={cx(p.td, s.cell, s.date)} data-label="Alta">
              {argentinaDate(customer.createdAt)}
            </td>
            <td className={cx(p.td, s.cell, s.date)} data-label="Último pedido">
              {customer.lastOrderAt ? argentinaDate(customer.lastOrderAt) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
