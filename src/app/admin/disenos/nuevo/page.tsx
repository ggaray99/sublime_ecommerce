import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DesignForm } from "@/components/admin/design-forms";
import { AdminUnavailable, loadCategoryOptions } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { hasPrivateStorage } from "@/server/media/private-files";
import { hasMediaStorage } from "@/server/media/public-files";

export const metadata: Metadata = {
  title: "Nuevo diseño",
  robots: { index: false, follow: false },
};

async function NewDesign() {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();
  const categories = await loadCategoryOptions();

  return (
    <div className="account">
      <p>
        <Link href="/admin/disenos">← Volver a diseños</Link>
      </p>
      <section className="account__section" aria-labelledby="nuevo-title">
        <h2 id="nuevo-title">Datos del diseño</h2>
        {hasMediaStorage() && hasPrivateStorage() ? (
          <>
            <p className="muted">
              Se crea en borrador salvo que marques &quot;Publicar ahora&quot;. Guardamos el archivo en alta resolución para producción
              y una versión liviana para la tienda.
            </p>
            <DesignForm mode="create" initial={{ name: "", slug: "", description: "", categoryId: "", kinds: [] }} categories={categories} />
          </>
        ) : (
          <p className="panel panel--muted">La carga de diseños no está configurada en este entorno (falta MEDIA_ROOT).</p>
        )}
      </section>
    </div>
  );
}

export default function NewDesignPage() {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="NUEVO DISEÑO." tone="light">
        <p>El diseño se crea y queda registrado con quién lo hizo.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <NewDesign />
      </Suspense>
    </main>
  );
}
