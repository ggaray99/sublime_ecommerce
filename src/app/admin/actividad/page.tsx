import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminUnavailable, AUDIT_AREAS, AuditList } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import type { AuditEntity } from "@/server/admin/repository";
import { adminAvailable, getAdminRepository, getCurrentAdmin } from "@/server/admin/session";

export const metadata: Metadata = {
  title: "Actividad · Administración",
  robots: { index: false, follow: false },
};

const PAGE = 50;

async function Activity({ searchParams }: { searchParams: PageProps<"/admin/actividad">["searchParams"] }) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();

  const query = await searchParams;
  const area = typeof query.area === "string" && query.area in AUDIT_AREAS ? (query.area as AuditEntity) : undefined;
  const before = typeof query.antes === "string" ? query.antes : undefined;
  const entries = await getAdminRepository().listAudit({ entity: area, before, limit: PAGE });
  const link = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])));
    return `/admin/actividad${search.size ? `?${search}` : ""}`;
  };

  return (
    <div className="account account--wide">
      <section className="account__section" aria-labelledby="actividad-title">
        <h2 id="actividad-title">Registro de cambios</h2>
        <p className="muted">Todo lo que se cambia en el panel, con quién y cuándo. Lo más reciente primero.</p>
        <nav className="admin-tabs" aria-label="Filtrar por área">
          <Link href="/admin/actividad" aria-current={!area ? "page" : undefined}>
            Todo
          </Link>
          {(Object.entries(AUDIT_AREAS) as [AuditEntity, string][]).map(([value, label]) => (
            <Link key={value} href={link({ area: value })} aria-current={area === value ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <AuditList entries={entries} />
        <div className="admin-pagination">
          {before ? <Link href={link({ area })}>← Lo más reciente</Link> : <span />}
          {entries.length === PAGE && <Link href={link({ area, antes: entries[entries.length - 1].id })}>Ver anteriores →</Link>}
        </div>
      </section>
    </div>
  );
}

export default function AdminActivityPage({ searchParams }: PageProps<"/admin/actividad">) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="Actividad" tone="light">
        <p>Registro de cambios del panel.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <Activity searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
