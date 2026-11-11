import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { PageTextForm } from "@/components/admin/settings-forms";
import { AdminUnavailable } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { infoPages } from "@/data/site";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { isInfoPageSlug } from "@/server/settings/pages";
import { getPagesRepository } from "@/server/settings/session";

export const metadata: Metadata = {
  title: "Página informativa · Administración",
  robots: { index: false, follow: false },
};

async function PageEditor({ params }: { params: PageProps<"/admin/ajustes/paginas/[slug]">["params"] }) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();
  const { slug } = await params;
  if (!isInfoPageSlug(slug)) notFound();
  const page = infoPages[slug];
  const saved = await getPagesRepository().get(slug);
  // Until something is saved, the editor starts from the default text, without its "A definir" placeholders.
  const initial = saved ?? {
    intro: page.intro,
    sections: page.sections.map(({ title, body, status }) => ({ title, body: status === "pendiente" ? "" : body })),
  };

  return (
    <div className="account">
      <AdminNav current="ajustes" />
      <section className="account__section" aria-labelledby="pagina-title">
        <h2 id="pagina-title">{page.title}</h2>
        <p className="muted">
          <Link href="/admin/ajustes#paginas">Volver a Ajustes</Link> · <Link href={`/${slug}`}>Ver la página</Link>
          {!saved && " · Todavía muestra el texto de ejemplo."}
        </p>
        <PageTextForm slug={slug} initial={initial} />
      </section>
    </div>
  );
}

export default function AdminPageTextPage({ params }: PageProps<"/admin/ajustes/paginas/[slug]">) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="PÁGINAS." tone="light">
        <p>El cambio queda registrado en Actividad.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <PageEditor params={params} />
      </Suspense>
    </main>
  );
}
