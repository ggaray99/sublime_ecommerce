import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CategoryForm } from "@/components/admin/category-forms";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminUnavailable } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { FALLBACK_CATEGORY_IMAGE } from "@/server/catalog/postgres-storefront";
import { adminAvailable, getCategoryRepository, getCurrentAdmin } from "@/server/admin/session";

export const metadata: Metadata = {
  title: "Categorías · Administración",
  robots: { index: false, follow: false },
};

async function Categories({ searchParams }: { searchParams: PageProps<"/admin/categorias">["searchParams"] }) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();
  const [categories, query] = await Promise.all([getCategoryRepository().listCategories(), searchParams]);
  const nextOrder = categories.reduce((max, category) => Math.max(max, category.sortOrder), -1) + 1;

  return (
    <div className="account">
      <AdminNav current="categorias" />
      {query.eliminada && (
        <p className="panel panel--muted" role="status">
          Categoría eliminada.
        </p>
      )}
      <section className="account__section" aria-labelledby="categorias-title">
        <h2 id="categorias-title">Categorías</h2>
        <ul className="address-list">
          {categories.map((category) => (
            <li key={category.id} className="address-card">
              <Image src={category.imageUrl || FALLBACK_CATEGORY_IMAGE} alt="" width={240} height={240} className="image-admin__thumb" />
              <p className="address-card__title">
                <Link href={`/admin/categorias/${category.id}`}>{category.label}</Link>
                {!category.active && <span className="badge badge--pending">Oculta</span>}
              </p>
              <p className="muted">
                {category.activeProductCount} publicados de {category.productCount} · orden {category.sortOrder}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="account__section" aria-labelledby="nueva-title">
        <h2 id="nueva-title">Nueva categoría</h2>
        <CategoryForm
          mode="create"
          initial={{ id: "", label: "", tagline: "", description: "", sortOrder: String(nextOrder), active: true }}
        />
      </section>
    </div>
  );
}

export default function AdminCategoriesPage({ searchParams }: PageProps<"/admin/categorias">) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="CATEGORÍAS." tone="light">
        <p>Entorno de prueba: los cambios se guardan en la base de staging y quedan registrados.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <Categories searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
