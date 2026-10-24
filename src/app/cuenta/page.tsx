import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AddressForm, ProfileForm } from "@/components/account/forms";
import { AccountsUnavailable } from "@/components/account/unavailable";
import { PageIntro } from "@/components/page-intro";
import { argentinaTime, orderStatusLabel } from "@/components/orders/order-view";
import { formatPrice } from "@/lib/format";
import { getCurrentAdmin } from "@/server/admin/session";
import { orderNumber } from "@/server/orders/repository";
import { getOrderRepository, ordersAvailable } from "@/server/orders/session";
import { requestStatusLabel } from "@/components/requests/request-view";
import { requestNumber } from "@/server/custom-requests/repository";
import { customRequestsAvailable, getCustomRequestRepository } from "@/server/custom-requests/session";
import { accountsAvailable, getCurrentCustomer, getCustomerRepository } from "@/server/customers/session";
import { deleteAddressAction, setDefaultAddressAction, signOutAction } from "./actions";

export const metadata: Metadata = {
  title: "Mi cuenta",
  description: "Tus datos y direcciones de entrega en Sublime.",
  robots: { index: false, follow: false },
};

/** Reads the session cookie, so it renders per request inside Suspense. */
async function AccountContent() {
  // Opt out of prerendering before touching the session cookie.
  await connection();
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/cuenta/ingresar");
  const [addresses, admin, orders, requests] = await Promise.all([
    getCustomerRepository().listAddresses(customer.id),
    getCurrentAdmin(),
    ordersAvailable() ? getOrderRepository().listOrders({ customerId: customer.id, limit: 20 }) : Promise.resolve([]),
    customRequestsAvailable() ? getCustomRequestRepository().list({ customerId: customer.id, limit: 20 }) : Promise.resolve([]),
  ]);

  return (
    <div className="account">
      <section className="account__section" aria-labelledby="perfil-title">
        <div className="account__head">
          <h2 id="perfil-title">Tus datos</h2>
          <form action={signOutAction}>
            <button type="submit" className="link-button">
              Cerrar sesión
            </button>
          </form>
        </div>
        <p className="muted">Email: {customer.email}</p>
        {admin && (
          <p>
            <Link href="/admin">Ir al panel de administración</Link>
          </p>
        )}
        <ProfileForm fullName={customer.fullName} phone={customer.phone} />
      </section>

      <section className="account__section" aria-labelledby="pedidos-title">
        <h2 id="pedidos-title">Mis pedidos</h2>
        {orders.length ? (
          <ul className="audit-list">
            {orders.map((order) => (
              <li key={order.id}>
                <p>
                  <Link href={`/pedido/${order.id}`}>
                    <strong>{orderNumber(order)}</strong>
                  </Link>{" "}
                  · {orderStatusLabel[order.status]} · {formatPrice(order.subtotalMinor / 100)}
                </p>
                <p className="muted">{argentinaTime(order.createdAt)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Todavía no hiciste pedidos.</p>
        )}
      </section>

      <section className="account__section" aria-labelledby="encargos-title">
        <h2 id="encargos-title">Mis encargos</h2>
        {requests.length ? (
          <ul className="audit-list">
            {requests.map((request) => (
              <li key={request.id}>
                <p>
                  <Link href={`/encargo/${request.id}`}>
                    <strong>{requestNumber(request)}</strong>
                  </Link>{" "}
                  · {request.productType} · {requestStatusLabel[request.status]}
                  {request.quoteMinor !== null && ` · ${formatPrice(request.quoteMinor / 100)}`}
                </p>
                <p className="muted">{argentinaTime(request.createdAt)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            Todavía no pediste encargos. <Link href="/encargos">Pedí uno a medida</Link>.
          </p>
        )}
      </section>

      <section className="account__section" aria-labelledby="direcciones-title">
        <h2 id="direcciones-title">Direcciones de entrega</h2>
        {addresses.length ? (
          <ul className="address-list">
            {addresses.map((address) => (
              <li key={address.id} className="address-card">
                <p className="address-card__title">
                  {address.label || "Dirección"}
                  {address.isDefault && <span className="badge badge--acid">Principal</span>}
                </p>
                <p>
                  {address.recipient}
                  <br />
                  {address.street} {address.streetNumber}
                  {address.apartment && `, ${address.apartment}`}
                  <br />
                  {address.city}, {address.province} ({address.postalCode})
                </p>
                {address.notes && <p className="muted">{address.notes}</p>}
                <div className="address-card__actions">
                  {!address.isDefault && (
                    <form action={setDefaultAddressAction}>
                      <input type="hidden" name="addressId" value={address.id} />
                      <button type="submit" className="link-button">
                        Usar como principal
                      </button>
                    </form>
                  )}
                  <form action={deleteAddressAction}>
                    <input type="hidden" name="addressId" value={address.id} />
                    <button type="submit" className="link-button">
                      Eliminar<span className="visually-hidden"> {address.label || "dirección"}</span>
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Todavía no guardaste direcciones.</p>
        )}
        <h3 className="account__subtitle">Agregar dirección</h3>
        <AddressForm />
      </section>
    </div>
  );
}

export default function CuentaPage() {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Mi cuenta" title="MI CUENTA." tone="light">
        <p>Entorno de prueba: las cuentas y direcciones se guardan en la base de staging.</p>
      </PageIntro>
      {accountsAvailable() ? (
        <Suspense fallback={<p className="panel panel--muted">Cargando tu cuenta…</p>}>
          <AccountContent />
        </Suspense>
      ) : (
        <AccountsUnavailable />
      )}
    </main>
  );
}
