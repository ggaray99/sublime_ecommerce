import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminUnavailable } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { DESIGN_STATUS_LABELS, DESIGN_STATUSES, MOCKUP_KIND_LABELS, MOCKUP_KINDS, type DesignStatus } from "@/lib/designs/kinds";
import { adminAvailable, getCurrentAdmin, getDesignRepository } from "@/server/admin/session";

export const metadata: Metadata = {
  title: "Diseños · Administración",
  robots: { index: false, follow: false },
};

const STATUS_BADGE: Record<DesignStatus, string> = { published: "badge badge--ok", draft: "badge badge--pending", archived: "badge" };

async function Designs({ searchParams }: { searchParams: PageProps<"/admin/disenos">["searchParams"] }) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();

  const repo = getDesignRepository();
  const [all, bases, query] = await Promise.all([repo.listDesigns(), repo.listMockupBases(), searchParams]);
  const status = DESIGN_STATUSES.find((value) => value === query.estado);
  const designs = status ? all.filter((design) => design.status === status) : all;
  const unlinked = MOCKUP_KINDS.filter((kind) => !bases[kind] && all.some((design) => design.kinds.includes(kind)));

  return (
    <div className="account account--wide">
      <AdminNav current="disenos" />
      {query.eliminado && (
        <p className="panel panel--muted" role="status">
          Diseño eliminado.
        </p>
      )}
      <section className="account__section" aria-labelledby="disenos-title">
        <h2 id="disenos-title">Diseños</h2>
        <p>
          <Link href="/admin/disenos/nuevo" className="btn btn--coal">
            Nuevo diseño
          </Link>
        </p>
        {unlinked.length > 0 && (
          <p className="form-alert" role="status">
            {unlinked.map((kind) => MOCKUP_KIND_LABELS[kind]).join(", ")}: no {unlinked.length === 1 ? "tiene" : "tienen"} un producto
            base asignado, así que los diseños no se pueden comprar en {unlinked.length === 1 ? "ese soporte" : "esos soportes"}.{" "}
            <Link href="/admin/soportes">Configurar soportes</Link>
          </p>
        )}
        <nav className="admin-tabs" aria-label="Filtrar por estado">
          <Link href="/admin/disenos" aria-current={!status ? "page" : undefined}>
            Todos ({all.length})
          </Link>
          {DESIGN_STATUSES.map((value) => (
            <Link key={value} href={`/admin/disenos?estado=${value}`} aria-current={status === value ? "page" : undefined}>
              {DESIGN_STATUS_LABELS[value]} ({all.filter((design) => design.status === value).length})
            </Link>
          ))}
        </nav>
        {designs.length ? (
          <ul className="address-list">
            {designs.map((design) => (
              <li key={design.id} className="address-card">
                {design.imageUrl ? (
                  <Image src={design.imageUrl} alt="" width={240} height={240} className="image-admin__thumb" />
                ) : (
                  <p className="muted">Sin imagen</p>
                )}
                <p className="address-card__title">
                  <Link href={`/admin/disenos/${design.id}`}>{design.name}</Link>{" "}
                  <span className={STATUS_BADGE[design.status]}>{DESIGN_STATUS_LABELS[design.status]}</span>
                  {!design.imageUrl && <span className="badge badge--pending">Sin imagen</span>}
                  {!design.kinds.length && <span className="badge badge--pending">Sin productos</span>}
                  {design.opaque && <span className="badge badge--pending">Sin transparencia</span>}
                </p>
                <p className="muted">
                  {design.kinds.length ? design.kinds.map((kind) => MOCKUP_KIND_LABELS[kind]).join(" · ") : "No está disponible en ningún producto"} ·{" "}
                  {design.orderCount === 1 ? "1 pedido" : `${design.orderCount} pedidos`}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{status ? "No hay diseños con ese estado." : "Todavía no hay diseños. Subí el primero."}</p>
        )}
      </section>
    </div>
  );
}

export default function AdminDesignsPage({ searchParams }: PageProps<"/admin/disenos">) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="Diseños" tone="light">
        <p>Subí un diseño, elegí en qué productos se ofrece y publicalo. Cada cambio queda registrado con quién lo hizo.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <Designs searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
