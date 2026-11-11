import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CategoryForm, DeleteCategoryForm } from "@/components/admin/category-forms";
import { AdminNav } from "@/components/admin/admin-nav";
import { CategoryImageUpload } from "@/components/admin/media-forms";
import { AdminUnavailable, AuditList } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { FALLBACK_CATEGORY_IMAGE } from "@/server/catalog/postgres-storefront";
import { AdminDataError } from "@/server/admin/repository";
import { adminAvailable, getAdminRepository, getCategoryRepository, getCurrentAdmin } from "@/server/admin/session";
import { hasMediaStorage } from "@/server/media/public-files";

export const metadata: Metadata = {
  title: "Editar categoría",
  robots: { index: false, follow: false },
};

type Props = PageProps<"/admin/categorias/[id]">;

async function CategoryAdmin({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();

  const { id } = await params;
  const category = await getCategoryRepository()
    .getCategory(id)
    .catch((error) => {
      if (error instanceof AdminDataError) notFound();
      throw error;
    });
  const [audit, query] = await Promise.all([getAdminRepository().listAudit({ entity: "category", entityId: id, limit: 20 }), searchParams]);

  return (
    <div className="account">
      <AdminNav current="categorias" />
      <section className="account__section" aria-labelledby="categoria-title">
        <h2 id="categoria-title">{category.label}</h2>
        <p className="muted">
          Identificador {category.id} · {category.activeProductCount} productos publicados de {category.productCount} ·{" "}
          {category.active ? <Link href={`/tienda?categoria=${category.id}`}>Ver en la tienda</Link> : "Oculta en la tienda"}
        </p>
        {query.creada && (
          <p className="panel panel--muted" role="status">
            {query.imagen === "error"
              ? "Categoría creada, pero la imagen no se pudo guardar. Subila de nuevo desde Imagen."
              : category.imageUrl
                ? "Categoría creada con su imagen. Ya podés asignarle productos."
                : "Categoría creada. Ya podés asignarle productos y subir su imagen."}
          </p>
        )}
        <CategoryForm
          mode="edit"
          initial={{
            id: category.id,
            label: category.label,
            tagline: category.tagline,
            description: category.description,
            sortOrder: String(category.sortOrder),
            active: category.active,
          }}
        />
      </section>

      <section className="account__section" aria-labelledby="imagen-title">
        <h2 id="imagen-title">Imagen</h2>
        <Image src={category.imageUrl || FALLBACK_CATEGORY_IMAGE} alt="" width={320} height={320} className="image-admin__thumb" />
        {hasMediaStorage() ? (
          <CategoryImageUpload categoryId={category.id} hasImage={Boolean(category.imageUrl)} />
        ) : (
          <p className="panel panel--muted">La carga de imágenes no está configurada en este entorno (falta MEDIA_ROOT).</p>
        )}
      </section>

      <section className="account__section" aria-labelledby="eliminar-title">
        <h2 id="eliminar-title">Eliminar</h2>
        {category.productCount ? (
          <p className="muted">
            Tiene {category.productCount} productos. Para sacarla de la tienda, desmarcá &quot;Visible en la tienda&quot;; para
            eliminarla, primero mové sus productos a otra categoría.
          </p>
        ) : (
          <DeleteCategoryForm categoryId={category.id} label={category.label} />
        )}
      </section>

      <section className="account__section" aria-labelledby="historial-title">
        <h2 id="historial-title">Historial de cambios</h2>
        <AuditList entries={audit} />
      </section>
    </div>
  );
}

export default function AdminCategoryPage({ params, searchParams }: Props) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="EDITAR CATEGORÍA." tone="light">
        <p>Cada cambio queda registrado con quién lo hizo.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <CategoryAdmin params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
