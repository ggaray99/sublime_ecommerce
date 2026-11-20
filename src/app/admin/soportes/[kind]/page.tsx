import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminUnavailable, AuditList } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { isMockupKind, MOCKUP_KIND_LABELS } from "@/lib/designs/kinds";
import { mockupTemplate, slotKey, TEMPLATE_SLOTS } from "@/lib/designs/mockups";
import { adminAvailable, getAdminRepository, getCurrentAdmin, getMockupTemplateRepository } from "@/server/admin/session";
import { hasMediaStorage } from "@/server/media/public-files";
import { TemplateWorkspace, type SlotView } from "../template-editor";

export const metadata: Metadata = {
  title: "Imágenes del soporte · Administración",
  robots: { index: false, follow: false },
};

type Props = PageProps<"/admin/soportes/[kind]">;

async function KindTemplates({ params }: Pick<Props, "params">) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();
  const { kind } = await params;
  if (!isMockupKind(kind)) notFound();

  const templates = (await getMockupTemplateRepository().listTemplates()).filter((template) => template.kind === kind);
  const stored = new Map(templates.map((template) => [slotKey(template), template]));
  const slots: SlotView[] = TEMPLATE_SLOTS.filter((slot) => slot.kind === kind).map((slot) => {
    const current = stored.get(slotKey(slot));
    if (current) return { slot, src: current.imageUrl, area: current.area, ...(current.warp ? { warp: current.warp } : {}), custom: true, curve: current.curve };
    const builtIn = mockupTemplate(slot.kind, slot.tone, slot.side);
    return { slot, src: builtIn.src, area: builtIn.area, ...(builtIn.warp ? { warp: builtIn.warp } : {}), custom: false, curve: null };
  });
  const audit = (
    await Promise.all(slots.map(({ slot }) => getAdminRepository().listAudit({ entity: "design", entityId: slotKey(slot), limit: 15 })))
  )
    .flat()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 15);
  const label = MOCKUP_KIND_LABELS[kind];

  return (
    <div className="account">
      <AdminNav current="soportes" />
      <p>
        <Link href="/admin/soportes">← Volver a soportes</Link>
      </p>
      <section className="account__section" aria-labelledby="imagenes-title">
        <h2 id="imagenes-title">Imágenes de {label.toLowerCase()}</h2>
        <p className="muted">
          Elegí el color y el lado, subí una foto propia y marcá dónde va la estampa. La tienda usa la foto apenas la guardás; «Volver a la
          imagen original» deshace el cambio.
        </p>
        <TemplateWorkspace kind={kind} slots={slots} storage={hasMediaStorage()} />
      </section>
      <section className="account__section" aria-labelledby="historial-title">
        <h2 id="historial-title">Historial de cambios</h2>
        <AuditList entries={audit} />
      </section>
    </div>
  );
}

export default function AdminKindTemplatesPage({ params }: Props) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="SOPORTES." tone="light">
        <p>Cada cambio queda registrado con quién lo hizo.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <KindTemplates params={params} />
      </Suspense>
    </main>
  );
}
