import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { OrderActions } from "@/components/admin/order-actions";
import { AdminUnavailable } from "@/components/admin/shared";
import { argentinaTime, OrderSummary, orderStatusLabel } from "@/components/orders/order-view";
import { PageIntro } from "@/components/page-intro";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { orderNumber, type OrderStatus } from "@/server/orders/repository";
import { getOrderRepository } from "@/server/orders/session";

export const metadata: Metadata = {
  title: "Pedido · Administración",
  robots: { index: false, follow: false },
};

const statusName = (status: string | null) => (status ? (orderStatusLabel[status as OrderStatus] ?? status) : "—");

async function OrderAdmin({ params }: { params: PageProps<"/admin/pedidos/[id]">["params"] }) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();

  const { id } = await params;
  const repo = getOrderRepository();
  await repo.releaseExpired();
  const order = await repo.getOrder(id).catch(() => null);
  if (!order) notFound();

  return (
    <div className="account">
      <AdminNav current="pedidos" />
      <p>
        <Link href="/admin/pedidos">← Volver a pedidos</Link>
      </p>
      <section className="account__section" aria-labelledby="pedido-title">
        <h2 id="pedido-title">Pedido {orderNumber(order)}</h2>
        <p className="muted">
          {order.contactName} · <a href={`mailto:${order.contactEmail}`}>{order.contactEmail}</a>
          {order.contactPhone && ` · ${order.contactPhone}`} · {order.customerId ? "cliente con cuenta" : "compra como invitado"}
        </p>
        {order.status === "pending_payment" && (
          <p className="panel panel--muted">Stock reservado hasta {argentinaTime(order.expiresAt)} (hora de Argentina). Si no se confirma el pago, vence solo.</p>
        )}
        {order.status === "needs_review" && (
          <p className="form-alert">Pago recibido tarde y sin stock suficiente: definí con el cliente reposición, demora o devolución, y cancelá o reponé stock.</p>
        )}
        <OrderSummary order={order} />
      </section>

      <section className="account__section" aria-labelledby="acciones-title">
        <h2 id="acciones-title">Acciones</h2>
        <OrderActions orderId={order.id} status={order.status} shipping={order.delivery.method === "shipping"} />
      </section>

      <section className="account__section" aria-labelledby="historial-title">
        <h2 id="historial-title">Historial</h2>
        <ol className="audit-list">
          {order.events.map((event, index) => (
            <li key={index}>
              <p>
                <strong>{statusName(event.toStatus)}</strong>
                {event.fromStatus && <span className="muted"> (antes: {statusName(event.fromStatus)})</span>}
                {event.note && ` · ${event.note}`}
              </p>
              <p className="muted">
                {event.actor} · {argentinaTime(event.createdAt)}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default function AdminOrderPage({ params }: PageProps<"/admin/pedidos/[id]">) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="PEDIDO." tone="light">
        <p>Entorno de prueba: pedido de la base de staging.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <OrderAdmin params={params} />
      </Suspense>
    </main>
  );
}
