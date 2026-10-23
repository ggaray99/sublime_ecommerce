import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AddressForm, ProfileForm } from "@/components/account/forms";
import { AccountsUnavailable } from "@/components/account/unavailable";
import { PageIntro } from "@/components/page-intro";
import { accountsAvailable, getCurrentCustomer, getCustomerRepository } from "@/server/customers/session";
import { deleteAddressAction, setDefaultAddressAction, signOutAction } from "./actions";

export const metadata: Metadata = {
  title: "Mi cuenta",
  description: "Tus datos y direcciones de entrega en Sublime.",
  robots: { index: false, follow: false },
};

/** Reads the session cookie, so it renders per request inside Suspense. */
async function AccountContent() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/cuenta/ingresar");
  const addresses = await getCustomerRepository().listAddresses(customer.id);

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
        <ProfileForm fullName={customer.fullName} phone={customer.phone} />
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
