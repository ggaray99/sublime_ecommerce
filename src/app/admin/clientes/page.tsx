import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminUnavailable } from "@/components/admin/shared";
import { argentinaTime } from "@/components/orders/order-view";
import { PageIntro } from "@/components/page-intro";
import { formatPrice } from "@/lib/format";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { getCustomerAdminRepository } from "@/server/customers/session";

export const metadata: Metadata = {
  title: "Clientes · Administración",
  robots: { index: false, follow: false },
};

const LIMIT = 200;

async function Customers({ searchParams }: { searchParams: PageProps<"/admin/clientes">["searchParams"] }) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q : "";
  const repo = getCustomerAdminRepository();
  const [customers, total] = await Promise.all([repo.list({ search, limit: LIMIT }), repo.count()]);

  return (
    <div className="account account--wide">
      <section className="account__section" aria-labelledby="clientes-title">
        <h2 id="clientes-title">Clientes ({total})</h2>
        <form className="admin-search" role="search" action="/admin/clientes">
          <div className="field">
            <label htmlFor="clientes-q">Buscar</label>
            <input id="clientes-q" name="q" type="search" defaultValue={search} placeholder="Nombre, email o teléfono" maxLength={100} />
          </div>
          <button type="submit" className="btn btn--coal">
            Buscar
          </button>
          {search && <Link href="/admin/clientes">Ver todos</Link>}
        </form>
        {customers.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Alta</th>
                  <th scope="col">Pedidos</th>
                  <th scope="col">Compró</th>
                  <th scope="col">Último pedido</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.authUserId}>
                    <th scope="row">
                      <Link href={`/admin/clientes/${encodeURIComponent(customer.authUserId)}`}>{customer.name || customer.email}</Link>
                      {customer.isAdmin && <span className="badge badge--ok">Admin</span>}
                      <br />
                      <span className="muted">{customer.email}</span>
                    </th>
                    <td>{argentinaTime(customer.createdAt)}</td>
                    <td>
                      {customer.orderCount}
                      {customer.orderCount > customer.paidOrderCount && <span className="muted"> ({customer.paidOrderCount} pagados)</span>}
                    </td>
                    <td>{customer.spentMinor ? formatPrice(customer.spentMinor / 100) : "—"}</td>
                    <td>{customer.lastOrderAt ? argentinaTime(customer.lastOrderAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{search ? "Nadie coincide con esa búsqueda." : "Todavía no se registró nadie."}</p>
        )}
        {customers.length === LIMIT && <p className="muted">Se muestran los {LIMIT} más recientes. Usá el buscador para encontrar a alguien.</p>}
      </section>
    </div>
  );
}

export default function AdminCustomersPage({ searchParams }: PageProps<"/admin/clientes">) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="Clientes" tone="light">
        <p>Todas las personas que crearon una cuenta, con sus pedidos y encargos.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <Customers searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
