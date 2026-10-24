import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { PointForm, type PointFormValues } from "@/components/admin/point-forms";
import { AdminUnavailable } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { PROVINCES } from "@/server/customers/validation";
import { POINT_KINDS, type PointOfSale } from "@/server/points/repository";
import { getPointRepository } from "@/server/points/session";
import { deletePointAction } from "./actions";

export const metadata: Metadata = {
  title: "Puntos de venta · Administración",
  robots: { index: false, follow: false },
};

const KIND_OPTIONS = Object.entries(POINT_KINDS).map(([value, label]) => ({ value, label }));

const toForm = (point?: PointOfSale): PointFormValues => ({
  pointId: point?.id,
  name: point?.name ?? "",
  kind: point?.kind ?? "tienda",
  address: point?.address ?? "",
  city: point?.city ?? "",
  province: point?.province ?? "",
  location: point && point.latitude !== null ? `${point.latitude}, ${point.longitude}` : "",
  hours: point?.hours ?? "",
  phone: point?.phone ?? "",
  instagram: point?.instagram ?? "",
  notes: point?.notes ?? "",
  sortOrder: String(point?.sortOrder ?? 0),
  active: point?.active ?? true,
});

async function Points({ searchParams }: { searchParams: PageProps<"/admin/puntos">["searchParams"] }) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();

  const query = await searchParams;
  const points = await getPointRepository().list();
  const editing = points.find((point) => point.id === query.editar);

  return (
    <div className="account account--wide">
      <AdminNav current="puntos" />

      <section className="account__section" aria-labelledby="puntos-title">
        <div className="account__head">
          <h2 id="puntos-title">Puntos de venta</h2>
          <Link href="/puntos">Ver el mapa público →</Link>
        </div>
        <p className="muted">Los lugares donde se consiguen productos Sublime. Los activos aparecen en el mapa de la tienda.</p>
        {points.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Lugar</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Dirección</th>
                  <th scope="col">En el mapa</th>
                  <th scope="col">
                    <span className="visually-hidden">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {points.map((point) => (
                  <tr key={point.id} className={point.active ? undefined : "is-inactive"}>
                    <th scope="row">
                      {point.name}
                      {!point.active && <span className="badge badge--pending">Oculto</span>}
                    </th>
                    <td>{POINT_KINDS[point.kind]}</td>
                    <td>
                      {point.address}
                      <br />
                      <span className="muted">
                        {point.city}, {point.province}
                      </span>
                    </td>
                    <td>{point.latitude !== null ? "Ubicación exacta" : "Por dirección"}</td>
                    <td>
                      <div className="image-admin__actions">
                        <Link href={`/admin/puntos?editar=${point.id}#editar`}>
                          Editar<span className="visually-hidden"> {point.name}</span>
                        </Link>
                        <form action={deletePointAction}>
                          <input type="hidden" name="pointId" value={point.id} />
                          <ConfirmButton message={`¿Borrar "${point.name}"? Si solo querés ocultarlo, editalo y desmarcá "Mostrar en el mapa".`}>
                            Borrar<span className="visually-hidden"> {point.name}</span>
                          </ConfirmButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="panel panel--muted">Todavía no cargaste puntos de venta. Agregá el primero con el formulario de abajo.</p>
        )}
      </section>

      <section className="account__section" aria-labelledby="editar-title" id="editar">
        <h2 id="editar-title">{editing ? `Editar: ${editing.name}` : "Nuevo punto de venta"}</h2>
        {editing && <Link href="/admin/puntos">Cancelar edición</Link>}
        <PointForm key={editing?.id ?? "new"} initial={toForm(editing)} kinds={KIND_OPTIONS} provinces={PROVINCES} />
      </section>
    </div>
  );
}

export default function AdminPointsPage({ searchParams }: PageProps<"/admin/puntos">) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="PUNTOS DE VENTA." tone="light">
        <p>Los lugares que aparecen en el mapa de la tienda.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <Points searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
