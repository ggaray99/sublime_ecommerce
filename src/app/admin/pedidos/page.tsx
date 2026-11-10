import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminUnavailable } from "@/components/admin/shared";
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

  return (
    <div className="account account--wide">
      <AdminNav current="pedidos" />
      {released.orders > 0 && (
        <p className="panel panel--muted" role="status">
          {released.orders === 1 ? "Venció 1 pedido" : `Vencieron ${released.orders} pedidos`} sin pago: su stock se liberó.
        </p>
      )}
      <section className="account__section" aria-labelledby="pedidos-title">
        <h2 id="pedidos-title">Pedidos</h2>
        <nav className="admin-tabs" aria-label="Filtrar por estado">
          <Link href="/admin/pedidos" aria-current={!status ? "page" : undefined}>
            Todos ({Object.values(counts).reduce((sum, n) => sum + n, 0)})
          </Link>
          {ORDER_STATUSES.map((value) => (
            <Link key={value} href={`/admin/pedidos?estado=${value}`} aria-current={status === value ? "page" : undefined}>
              {orderStatusLabel[value]} ({counts[value]})
            </Link>
          ))}
        </nav>
        {orders.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
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
      <PageIntro kicker="Administración" title="PEDIDOS." tone="light">
        <p>Los pagos con Mercado Pago se confirman solos. Las transferencias se confirman acá.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <Orders searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
