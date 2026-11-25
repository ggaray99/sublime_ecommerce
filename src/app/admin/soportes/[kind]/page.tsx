import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminUnavailable, AuditList } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { isMockupKind, MOCKUP_KIND_LABELS } from "@/lib/designs/kinds";
import {
  hasGarmentColors,
  MOCKUP_TONES,
  mockupTemplate,
  slotKey,
  slotTone,
  TEMPLATE_SLOTS,
  type MockupTone,
  type TemplateOverrides,
  type TemplateSlot,
} from "@/lib/designs/mockups";
import { adminAvailable, getAdminRepository, getCurrentAdmin, getDesignRepository, getMockupTemplateRepository } from "@/server/admin/session";
import { getSql } from "@/server/db/client";
import { createSizeGuideRepository, EXAMPLE_SIZE_GUIDE_HEADERS, SIZE_GUIDE_LIMITS, sizeGuideAuditId } from "@/server/designs/size-guides";
import { hasMediaStorage } from "@/server/media/public-files";
import { SizeGuideEditor } from "../size-guide-editor";
import { TemplateWorkspace, type SlotView, type ToneOption } from "../template-editor";

export const metadata: Metadata = {
  title: "Imágenes del soporte · Administración",
  robots: { index: false, follow: false },
};

type Props = PageProps<"/admin/soportes/[kind]">;

/** The light/dark templates of a kind that comes in colors: what a color without its own photo shows. */
const GENERIC_LABELS: Record<MockupTone, string> = {
  light: "Base clara (colores sin foto propia)",
  dark: "Base oscura (colores sin foto propia)",
};
/** Mugs and stickers have a single template. */
const TONE_NAMES: Record<MockupTone, string> = { light: "Blanco", dark: "Negro" };

async function KindTemplates({ params }: Pick<Props, "params">) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();
  const { kind } = await params;
  if (!isMockupKind(kind)) notFound();

  const templates = (await getMockupTemplateRepository().listTemplates()).filter((template) => template.kind === kind);
  const stored = new Map(templates.map((template) => [slotKey(template), template]));
  const overrides: TemplateOverrides = Object.fromEntries(
    templates.map((template) => [slotKey(template), { src: template.imageUrl, area: template.area, ...(template.warp ? { warp: template.warp } : {}) }]),
  );
  const withColors = hasGarmentColors(kind);
  const isGeneric = (tone: string) => (MOCKUP_TONES as readonly string[]).includes(tone);
  // A color literally keyed "light" or "dark" is the generic template itself.
  const colors = withColors ? ((await getDesignRepository().listKindColors())[kind] ?? []).filter((color) => !isGeneric(color.key)) : [];
  // Colors with a photo of their own that the base product no longer offers stay listed, so the photo can be removed.
  const orphans = withColors
    ? [...new Set(templates.map((template) => template.tone))].filter(
        (tone) => !isGeneric(tone) && !colors.some((color) => color.key === tone),
      )
    : [];
  const generic = TEMPLATE_SLOTS.filter((slot) => slot.kind === kind);
  const sides = [...new Set(generic.map((slot) => slot.side))];
  const tones: ToneOption[] = [
    ...colors.map(({ key, label }) => ({ value: key, label, color: true })),
    ...orphans.map((key) => ({ value: key, label: `${key} (ya no está en el producto base)`, color: true })),
    ...[...new Set(generic.map((slot) => slot.tone))].map((tone) => ({
      value: tone,
      label: withColors ? GENERIC_LABELS[slotTone(tone)] : TONE_NAMES[slotTone(tone)],
      color: false,
    })),
  ];

  const slots: SlotView[] = tones.flatMap(({ value: tone, color }) =>
    sides.map((side): SlotView => {
      const slot: TemplateSlot = { kind, tone, side };
      const current = stored.get(slotKey(slot));
      if (current) return { slot, src: current.imageUrl, area: current.area, ...(current.warp ? { warp: current.warp } : {}), custom: true, curve: current.curve, fallback: null };
      // What the store shows: a color without its own photo uses its light/dark base (uploaded or built-in).
      const shown = color ? mockupTemplate(kind, slotTone(tone), side, overrides, tone) : mockupTemplate(kind, slotTone(tone), side);
      const fallback = color ? `Sin foto propia: se muestra la ${slotTone(tone) === "dark" ? "base oscura" : "base clara"}.` : null;
      return { slot, src: shown.src, area: shown.area, ...(shown.warp ? { warp: shown.warp } : {}), custom: false, curve: null, fallback };
    }),
  );
  const sizeGuide = await createSizeGuideRepository(getSql()).getSizeGuide(kind);
  const auditIds = [...slots.map(({ slot }) => slotKey(slot)), sizeGuideAuditId(kind)];
  const audit = (await Promise.all(auditIds.map((entityId) => getAdminRepository().listAudit({ entity: "design", entityId, limit: 15 }))))
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
        {withColors && (
          <p className="muted">
            Cada color del producto base puede tener su foto. Un color sin foto propia usa la base clara u oscura, según qué tan oscuro sea.
          </p>
        )}
        {withColors && !colors.length && (
          <p className="panel panel--muted">
            Los colores salen de las variantes «Color» del producto base vinculado a {label.toLowerCase()}. Vinculá el producto base en{" "}
            <Link href="/admin/soportes">Soportes</Link> y cargale variantes con la opción «Color» (por ejemplo, Color: Crema) desde{" "}
            <Link href="/admin/productos">Productos</Link>; mientras tanto se usan la base clara y la oscura.
          </p>
        )}
        <TemplateWorkspace kind={kind} tones={tones} slots={slots} storage={hasMediaStorage()} />
      </section>
      <section className="account__section" aria-labelledby="talles-title">
        <h2 id="talles-title">Guía de talles</h2>
        <p className="muted">
          La tabla que ve el cliente en cada diseño sobre {label.toLowerCase()}. Escribí los títulos de las columnas y una fila por talle;
          las filas vacías no se guardan.
        </p>
        <SizeGuideEditor
          kind={kind}
          label={label}
          guide={sizeGuide && { headers: sizeGuide.headers, rows: sizeGuide.rows, note: sizeGuide.note }}
          exampleHeaders={EXAMPLE_SIZE_GUIDE_HEADERS}
          limits={SIZE_GUIDE_LIMITS}
        />
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
