import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { DeleteDesignForm, DesignFileUpload, DesignForm, DesignStatusForm } from "@/components/admin/design-forms";
import { AdminUnavailable, AuditList, loadCategoryOptions } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { DESIGN_STATUS_LABELS, MOCKUP_KIND_LABELS } from "@/lib/designs/kinds";
import { AdminDataError } from "@/server/admin/repository";
import { adminAvailable, getAdminRepository, getCurrentAdmin, getDesignRepository } from "@/server/admin/session";
import { hasPrivateStorage } from "@/server/media/private-files";
import { hasMediaStorage } from "@/server/media/public-files";

export const metadata: Metadata = {
  title: "Editar diseño",
  robots: { index: false, follow: false },
};

type Props = PageProps<"/admin/disenos/[id]">;

async function DesignAdmin({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();

  const { id } = await params;
  const repo = getDesignRepository();
  const design = await repo.getDesign(id).catch((error) => {
    if (error instanceof AdminDataError) notFound();
    throw error;
  });
  const [categories, themes, bases, kindColors, audit, query] = await Promise.all([
    loadCategoryOptions(),
    repo.listThemes(),
    repo.listMockupBases(),
    repo.listKindColors(),
    getAdminRepository().listAudit({ entity: "design", entityId: id, limit: 20 }),
    searchParams,
  ]);
  const unlinked = design.kinds.filter((kind) => !bases[kind]);

  return (
    <div className="account">
      <AdminNav current="disenos" />
      <p>
        <Link href="/admin/disenos">← Volver a diseños</Link>
      </p>
      <section className="account__section" aria-labelledby="diseno-title">
        <h2 id="diseno-title">{design.name}</h2>
        <p className="muted">
          {DESIGN_STATUS_LABELS[design.status]} · {design.orderCount === 1 ? "1 pedido" : `${design.orderCount} pedidos`}
          {design.status === "published" && (
            <>
              {" "}
              · <Link href={`/disenos/${design.slug}`}>Ver en la tienda</Link>
            </>
          )}
        </p>
        {query.creado && (
          <p className="panel panel--muted" role="status">
            {query.publicar === "error"
              ? `Diseño creado como borrador: no se pudo publicar. ${design.kinds.length ? "Revisá los datos y publicalo desde Estado." : "Elegí en qué productos está disponible antes de publicarlo."}`
              : design.status === "published"
                ? "Diseño creado y publicado."
                : "Diseño creado en borrador. Publicalo desde Estado cuando esté listo."}
          </p>
        )}
        {unlinked.length > 0 && (
          <p className="form-alert" role="status">
            {unlinked.map((kind) => MOCKUP_KIND_LABELS[kind]).join(", ")}: falta asignar el producto base, así que este diseño todavía
            no se puede comprar ahí. <Link href="/admin/soportes">Configurar soportes</Link>
          </p>
        )}
        <DesignForm
          mode="edit"
          designId={design.id}
          initial={{
            name: design.name,
            slug: design.slug,
            description: design.description,
            categoryId: design.categoryId ?? "",
            kinds: design.kinds,
            // A kind without saved colors (designs from before colors) shows every color checked.
            colors: design.colors,
            themeIds: design.themeIds,
          }}
          categories={categories}
          themes={themes}
          kindColors={kindColors}
        />
      </section>

      <section className="account__section" aria-labelledby="estado-title">
        <h2 id="estado-title">Estado</h2>
        <p className="muted">
          Ahora: {DESIGN_STATUS_LABELS[design.status]}. Solo los diseños publicados se ven en la tienda; archivar lo saca de la tienda
          sin perder sus pedidos.
        </p>
        <DesignStatusForm designId={design.id} status={design.status} />
      </section>

      <section className="account__section" aria-labelledby="archivo-title">
        <h2 id="archivo-title">Archivo</h2>
        {design.imageUrl ? (
          <>
            <Image src={design.imageUrl} alt={`Vista previa de ${design.name}`} width={320} height={320} className="image-admin__thumb" />
            <p className="muted">
              {design.width && design.height ? `${design.width} × ${design.height} px · ` : ""}
              {design.sourcePath && <a href={`/admin/disenos/${design.id}/archivo`}>Descargar archivo de producción (PNG)</a>}
            </p>
            {design.opaque && (
              <p className="form-alert" role="status">
                La imagen no tiene fondo transparente: se va a imprimir con su fondo. Para remeras de color conviene un PNG transparente.
              </p>
            )}
          </>
        ) : (
          <p className="muted">Todavía no tiene archivo.</p>
        )}
        {hasMediaStorage() && hasPrivateStorage() ? (
          <DesignFileUpload designId={design.id} />
        ) : (
          <p className="panel panel--muted">La carga de diseños no está configurada en este entorno (falta MEDIA_ROOT).</p>
        )}
      </section>

      <section className="account__section" aria-labelledby="eliminar-title">
        <h2 id="eliminar-title">Eliminar</h2>
        {design.orderCount ? (
          <p className="muted">
            Tiene {design.orderCount === 1 ? "1 pedido" : `${design.orderCount} pedidos`}: archivalo en lugar de eliminarlo, así los pedidos
            conservan su diseño.
          </p>
        ) : (
          <DeleteDesignForm designId={design.id} name={design.name} />
        )}
      </section>

      <section className="account__section" aria-labelledby="historial-title">
        <h2 id="historial-title">Historial de cambios</h2>
        <AuditList entries={audit} />
      </section>
    </div>
  );
}

export default function AdminDesignPage({ params, searchParams }: Props) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="EDITAR DISEÑO." tone="light">
        <p>Cada cambio queda registrado con quién lo hizo.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <DesignAdmin params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
