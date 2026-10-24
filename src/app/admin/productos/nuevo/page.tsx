import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProductForm } from "@/components/admin/forms";
import { AdminUnavailable, loadCategoryOptions, themeOptions } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { hasMediaStorage } from "@/server/media/public-files";

export const metadata: Metadata = {
  title: "Nuevo producto",
  robots: { index: false, follow: false },
};

async function NewProduct() {
  // Always request-time: also keeps the route dynamic where the panel is disabled.
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();
  const categoryOptions = await loadCategoryOptions();

  return (
    <div className="account">
      <p>
        <Link href="/admin">← Volver a productos</Link>
      </p>
      <section className="account__section" aria-labelledby="nuevo-title">
        <h2 id="nuevo-title">Datos del producto</h2>
        <p className="muted">
          Se crea en borrador salvo que elijas otro estado. Podés subir la foto principal ahora y sumar más después;
          sin fotos, la tienda muestra la imagen de la categoría.
        </p>
        <ProductForm
          mode="create"
          initial={{
            name: "",
            slug: "",
            description: "",
            categoryId: categoryOptions[0]?.value ?? "",
            theme: themeOptions[0].value,
            tags: "",
            details: "",
            featured: false,
            catalogCode: "",
            price: "",
            status: "draft",
          }}
          categories={categoryOptions}
          themes={themeOptions}
          uploadsEnabled={hasMediaStorage()}
        />
      </section>
    </div>
  );
}

export default function NewProductPage() {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="NUEVO PRODUCTO." tone="light">
        <p>El producto se crea y queda registrado con quién lo hizo.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <NewProduct />
      </Suspense>
    </main>
  );
}
