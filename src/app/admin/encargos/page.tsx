import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminUnavailable } from "@/components/admin/shared";
import { RowCheckbox, SelectableTable, SelectAllCheckbox } from "@/components/admin/selectable-table";
import { ExportSelectedButton, SelectionBar } from "@/components/admin/selection-bar";
import { argentinaTime } from "@/components/orders/order-view";
import { PageIntro } from "@/components/page-intro";
import { requestStatusLabel } from "@/components/requests/request-view";
import { formatPrice } from "@/lib/format";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { REQUEST_STATUSES, requestNumber, type RequestStatus } from "@/server/custom-requests/repository";
import { getCustomRequestRepository } from "@/server/custom-requests/session";

export const metadata: Metadata = {
  title: "Encargos · Administración",
  robots: { index: false, follow: false },
};

async function Requests({ searchParams }: { searchParams: PageProps<"/admin/encargos">["searchParams"] }) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();
  const query = await searchParams;
  const status = REQUEST_STATUSES.find((value) => value === query.estado) as RequestStatus | undefined;
  const repo = getCustomRequestRepository();
  const [requests, counts] = await Promise.all([repo.list({ status, limit: 200 }), repo.countByStatus()]);

  return (
    <div className="account account--wide">
      <section className="account__section" aria-labelledby="encargos-title">
        <h2 id="encargos-title">Encargos personalizados</h2>
        <nav className="admin-tabs" aria-label="Filtrar por estado">
          <Link href="/admin/encargos" aria-current={!status ? "page" : undefined}>
            Todos ({Object.values(counts).reduce((sum, n) => sum + n, 0)})
          </Link>
          {REQUEST_STATUSES.map((value) => (
            <Link key={value} href={`/admin/encargos?estado=${value}`} aria-current={status === value ? "page" : undefined}>
              {requestStatusLabel[value]} ({counts[value]})
            </Link>
          ))}
        </nav>
        {requests.length ? (
          // Another status tab starts with nothing selected (key).
          <SelectableTable key={status ?? "todos"} ids={requests.map((request) => request.id)}>
          <SelectionBar>
            <ExportSelectedButton endpoint="/admin/encargos/exportar" />
          </SelectionBar>
          <div className="admin-table-wrap">
            <table className="admin-table admin-table--selectable">
              <thead>
                <tr>
                  <th scope="col" className="admin-table__select">
                    <SelectAllCheckbox />
                  </th>
                  <th scope="col">Encargo</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Producto</th>
                  <th scope="col">Presupuesto</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id} className={request.status === "received" ? "is-low" : undefined}>
                    <td className="admin-table__select">
                      <RowCheckbox id={request.id} label={requestNumber(request)} />
                    </td>
                    <th scope="row">
                      <Link href={`/admin/encargos/${request.id}`}>{requestNumber(request)}</Link>
                    </th>
                    <td>{argentinaTime(request.createdAt)}</td>
                    <td>
                      {request.contactName}
                      <br />
                      <span className="muted">{request.contactEmail}</span>
                    </td>
                    <td>
                      {request.productType} · {request.quantity}
                    </td>
                    <td>{request.quoteMinor === null ? "—" : formatPrice(request.quoteMinor / 100)}</td>
                    <td>{requestStatusLabel[request.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </SelectableTable>
        ) : (
          <p className="muted">No hay encargos {status ? "en este estado" : "todavía"}.</p>
        )}
        <p className="muted">Los marcados en rojo esperan presupuesto.</p>
      </section>
    </div>
  );
}

export default function AdminRequestsPage({ searchParams }: PageProps<"/admin/encargos">) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="Encargos" tone="light">
        <p>Solicitudes de encargos personalizados.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <Requests searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
