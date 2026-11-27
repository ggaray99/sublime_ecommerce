import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminUnavailable } from "@/components/admin/shared";
import { argentinaTime, orderStatusLabel } from "@/components/orders/order-view";
import { requestStatusLabel } from "@/components/requests/request-view";
import { PageIntro } from "@/components/page-intro";
import { formatPrice } from "@/lib/format";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { requestNumber } from "@/server/custom-requests/repository";
import { getCustomRequestRepository } from "@/server/custom-requests/session";
import { getCustomerAdminRepository, getCustomerRepository } from "@/server/customers/session";
import { orderNumber, orderTotalMinor } from "@/server/orders/repository";
import { getOrderRepository } from "@/server/orders/session";

export const metadata: Metadata = {
  title: "Cliente · Administración",
  robots: { index: false, follow: false },
};

async function CustomerDetail({ params }: { params: PageProps<"/admin/clientes/[id]">["params"] }) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();
  const { id } = await params;
  const customer = await getCustomerAdminRepository().get(id);
  if (!customer) notFound();
  const customerId = customer.customerId;
  const [addresses, orders, requests] = customerId
    ? await Promise.all([
        getCustomerRepository().listAddresses(customerId),
        getOrderRepository().listOrders({ customerId, limit: 200 }),
        getCustomRequestRepository().list({ customerId, limit: 200 }),
      ])
    : [[], [], []];

  return (
    <div className="account account--wide">
      <p className="muted">
        <Link href="/admin/clientes">← Todos los clientes</Link>
      </p>
      <section className="account__section" aria-labelledby="cliente-title">
        <div className="account__head">
          <h2 id="cliente-title">{customer.name || customer.email}</h2>
          {customer.isAdmin && <span className="badge badge--ok">Admin</span>}
        </div>
        <dl className="order-facts">
          <div>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${customer.email}`}>{customer.email}</a>
            </dd>
          </div>
          <div>
            <dt>Teléfono</dt>
            <dd>{customer.phone || "—"}</dd>
          </div>
          <div>
            <dt>Cuenta creada</dt>
            <dd>{argentinaTime(customer.createdAt)}</dd>
          </div>
          <div>
            <dt>Última actividad</dt>
            <dd>{customer.lastSeenAt ? argentinaTime(customer.lastSeenAt) : "—"}</dd>
          </div>
          <div>
            <dt>Compró</dt>
            <dd>
              {formatPrice(customer.spentMinor / 100)} en {customer.paidOrderCount} {customer.paidOrderCount === 1 ? "pedido pagado" : "pedidos pagados"}
            </dd>
          </div>
        </dl>
        {!customerId && <p className="panel panel--muted">Se registró pero todavía no abrió Mi cuenta: no tiene datos, direcciones ni pedidos con su cuenta.</p>}
      </section>

      <section className="account__section" aria-labelledby="pedidos-title">
        <h2 id="pedidos-title">Pedidos ({orders.length})</h2>
        {orders.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Pedido</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Entrega</th>
                  <th scope="col">Total</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <th scope="row">
                      <Link href={`/admin/pedidos/${order.id}`}>{orderNumber(order)}</Link>
                    </th>
                    <td>{argentinaTime(order.createdAt)}</td>
                    <td>{order.delivery.method === "shipping" ? `Envío · ${order.delivery.address.city}` : "Retiro"}</td>
                    <td>{formatPrice(orderTotalMinor(order) / 100)}</td>
                    <td>{orderStatusLabel[order.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Sin pedidos con su cuenta. Los pedidos como invitado no se vinculan a la cuenta.</p>
        )}
      </section>

      <section className="account__section" aria-labelledby="encargos-title">
        <h2 id="encargos-title">Encargos ({requests.length})</h2>
        {requests.length ? (
          <ul className="address-list">
            {requests.map((request) => (
              <li key={request.id} className="address-card">
                <p className="address-card__title">
                  <Link href={`/admin/encargos/${request.id}`}>{requestNumber(request)}</Link> · {requestStatusLabel[request.status]}
                </p>
                <p className="muted">
                  {argentinaTime(request.createdAt)} · {request.productType} · {request.quantity}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Sin encargos con su cuenta.</p>
        )}
      </section>

      <section className="account__section" aria-labelledby="direcciones-title">
        <h2 id="direcciones-title">Direcciones ({addresses.length})</h2>
        {addresses.length ? (
          <ul className="address-list">
            {addresses.map((address) => (
              <li key={address.id} className="address-card">
                <p className="address-card__title">
                  {address.label || "Dirección"}
                  {address.isDefault && <span className="badge badge--ok">Predeterminada</span>}
                </p>
                <p>
                  {address.recipient}
                  <br />
                  {address.street} {address.streetNumber}
                  {address.apartment && `, ${address.apartment}`}
                  <br />
                  {address.city}, {address.province} ({address.postalCode})
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Sin direcciones guardadas.</p>
        )}
      </section>
    </div>
  );
}

export default function AdminCustomerPage({ params }: PageProps<"/admin/clientes/[id]">) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="Cliente" tone="light">
        <p>Datos, pedidos, encargos y direcciones de la cuenta.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <CustomerDetail params={params} />
      </Suspense>
    </main>
  );
}
