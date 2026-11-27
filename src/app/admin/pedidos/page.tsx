import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminUnavailable } from "@/components/admin/shared";
import { RowCheckbox, SelectableTable, SelectAllCheckbox } from "@/components/admin/selectable-table";
import { ExportSelectedButton, SelectionBar } from "@/components/admin/selection-bar";
import { argentinaTime, orderStatusLabel } from "@/components/orders/order-view";
import { PageIntro } from "@/components/page-intro";
import { formatPrice } from "@/lib/format";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { ORDER_STATUSES, orderNumber, orderTotalMinor, type OrderStatus } from "@/server/orders/repository";
import { getOrderRepository } from "@/server/orders/session";

export const metadata: Metadata = {
  title: "Pedidos · Administración",
  robots: { index: false, follow: false },
};

async function Orders({ searchParams }: { searchParams: PageProps<"/admin/pedidos">["searchParams"] }) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();

  const query = await searchParams;
  const status = ORDER_STATUSES.find((value) => value === query.estado) as OrderStatus | undefined;
  const repo = getOrderRepository();
  // Expiry does not depend on a scheduled job: due reservations are released here too.
  const released = await repo.releaseExpired();
  const [orders, counts] = await Promise.all([repo.listOrders({ status, limit: 200 }), repo.countByStatus()]);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <div className="account account--wide">
      {released.orders > 0 && (
        <p className="panel panel--muted" role="status">
          {released.orders === 1 ? "Venció 1 pedido" : `Vencieron ${released.orders} pedidos`} sin pago: su stock se liberó.
        </p>
      )}
      <section className="account__section admin-list" aria-labelledby="pedidos-title">
        {/* The page title already says "Pedidos": the heading stays for screen readers. */}
        <h2 id="pedidos-title" className="visually-hidden">
          Pedidos
        </h2>
        <nav className="admin-tabs" aria-label="Filtrar por estado">
          <Link href="/admin/pedidos" aria-current={!status ? "page" : undefined} className={total ? undefined : "is-empty"}>
            <span className="admin-tabs__label">Todos</span>
            <span className="visually-hidden">, </span>
            <span className="admin-tabs__count">{total}</span>
          </Link>
          {ORDER_STATUSES.map((value) => (
            <Link
              key={value}
              href={`/admin/pedidos?estado=${value}`}
              aria-current={status === value ? "page" : undefined}
              className={counts[value] ? undefined : "is-empty"}
            >
              <span className="admin-tabs__label">{orderStatusLabel[value]}</span>
              <span className="visually-hidden">, </span>
              <span className="admin-tabs__count">{counts[value]}</span>
            </Link>
          ))}
        </nav>
        {orders.length ? (
          // Another status tab starts with nothing selected (key).
          <SelectableTable key={status ?? "todos"} ids={orders.map((order) => order.id)}>
          <SelectionBar>
            <ExportSelectedButton endpoint="/admin/pedidos/exportar" />
          </SelectionBar>
          <div className="admin-table-wrap">
            <table className="admin-table admin-table--selectable">
              <thead>
                <tr>
                  <th scope="col" className="admin-table__select">
                    <SelectAllCheckbox />
                  </th>
                  <th scope="col">Pedido</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Entrega</th>
                  <th scope="col">Total</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className={order.status === "needs_review" ? "is-low" : undefined}>
                    <td className="admin-table__select">
                      <RowCheckbox id={order.id} label={orderNumber(order)} />
                    </td>
                    <th scope="row">
                      <Link href={`/admin/pedidos/${order.id}`}>{orderNumber(order)}</Link>
                    </th>
                    <td>{argentinaTime(order.createdAt)}</td>
                    <td>
                      {order.contactName}
                      <br />
                      <span className="muted">{order.contactEmail}</span>
                    </td>
                    <td>{order.delivery.method === "shipping" ? `Envío · ${order.delivery.address.city}` : "Retiro"}</td>
                    <td>{formatPrice(orderTotalMinor(order) / 100)}</td>
                    <td>
                      {orderStatusLabel[order.status]}
                      {order.status === "pending_payment" && <span className="muted"> · reserva hasta {argentinaTime(order.expiresAt).split(" ")[1]}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </SelectableTable>
        ) : (
          <p className="muted">No hay pedidos {status ? "en este estado" : "todavía"}.</p>
        )}
      </section>
    </div>
  );
}

export default function AdminOrdersPage({ searchParams }: PageProps<"/admin/pedidos">) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="Pedidos" tone="light">
        <p>Los pagos con Mercado Pago se confirman solos. Las transferencias se confirman acá.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <Orders searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
