import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminUnavailable, productStatusLabel } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { MOCKUP_KIND_LABELS, MOCKUP_KINDS } from "@/lib/designs/kinds";
import { MOCKUP_SIDE_LABELS, mockupTemplate, MOCKUPS, slotKey, TEMPLATE_SLOTS, type MockupTone, type TemplateOverrides } from "@/lib/designs/mockups";
import type { AdminProduct } from "@/server/admin/repository";
import type { ProductStatus } from "@/server/admin/validation";
import { adminAvailable, getAdminRepository, getCurrentAdmin, getDesignRepository, getMockupTemplateRepository } from "@/server/admin/session";
import { hasMediaStorage } from "@/server/media/public-files";
import { MockupBaseForm, type BaseOption } from "./base-form";
import { TemplateEditor } from "./template-editor";

const TONE_LABELS: Record<MockupTone, string> = { light: "Blanco", dark: "Negro" };

export const metadata: Metadata = {
  title: "Soportes · Administración",
  robots: { index: false, follow: false },
};

/** Every product, by name, for the base pickers (the admin search pages through 200 at a time). */
async function allProducts(): Promise<AdminProduct[]> {
  const repository = getAdminRepository();
  const products: AdminProduct[] = [];
  for (let page = 1; ; page++) {
    const result = await repository.searchProducts({ query: "", sort: "nombre", page, pageSize: 200 });
    products.push(...result.items);
    if (page >= result.pages) return products;
  }
}

const statusLabel = (status: string) => productStatusLabel[status as ProductStatus] ?? status;

async function MockupBases() {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();
  const [bases, products, templates] = await Promise.all([
    getDesignRepository().listMockupBases(),
    allProducts(),
    getMockupTemplateRepository().listTemplates(),
  ]);
  const stored = new Map(templates.map((template) => [slotKey(template), template]));
  const overrides: TemplateOverrides = Object.fromEntries(
    templates.map((template) => [slotKey(template), { src: template.imageUrl, area: template.area, ...(template.warp ? { warp: template.warp } : {}) }]),
  );
  const storage = hasMediaStorage();
  const options: BaseOption[] = products.map((product) => ({ value: product.id, label: `${product.name} (${statusLabel(product.status)})` }));

  return (
    <div className="account">
      <AdminNav current="soportes" />
      <section className="account__section" aria-labelledby="soportes-title">
        <h2 id="soportes-title">Soportes</h2>
        <p>
          Cada soporte (remera, musculosa, taza, sticker) se vende a través de un producto base. El precio, las variantes (talle, color) y
          el stock se editan en ese producto, desde <Link href="/admin">Productos</Link>. Los diseños usan esos datos: no tienen precio
          propio.
        </p>
        <p className="muted">
          Los productos base no aparecen sueltos en la tienda: se compran a través de los diseños. Cada soporte trae imágenes de
          demostración; podés reemplazar cada color y lado por una foto propia y marcar dónde va la estampa.
        </p>
        <ul className="address-list soportes-list">
          {MOCKUP_KINDS.map((kind) => {
            const base = bases[kind];
            const template = mockupTemplate(kind, "light", "front", overrides);
            const slots = TEMPLATE_SLOTS.filter((slot) => slot.kind === kind);
            const single = slots.length === 1;
            return (
              <li key={kind} className="address-card">
                <Image src={template.src} alt="" width={240} height={240} className="image-admin__thumb" />
                <p className="address-card__title">
                  {MOCKUP_KIND_LABELS[kind]}
                  {!base && <span className="badge badge--pending">Sin producto base</span>}
                </p>
                {base ? (
                  <p className="muted">
                    Producto base: <Link href={`/admin/productos/${base.legacyId}`}>{base.name}</Link> · {statusLabel(base.status)}
                    {base.status !== "active" && " (no se muestra en la tienda hasta que lo publiques)"}
                  </p>
                ) : (
                  <p className="muted">Los diseños no se pueden comprar en este soporte hasta que elijas su producto base.</p>
                )}
                <MockupBaseForm kind={kind} label={MOCKUP_KIND_LABELS[kind]} current={base?.legacyId ?? ""} options={options} />
                <details className="template-editor-details">
                  <summary>Imágenes de {MOCKUP_KIND_LABELS[kind].toLowerCase()}</summary>
                  <div className="template-editor-list">
                    {slots.map((slot) => {
                      const key = slotKey(slot);
                      const current = stored.get(key);
                      const used = mockupTemplate(slot.kind, slot.tone, slot.side, overrides);
                      const label = single
                        ? "Imagen"
                        : `${MOCKUPS[kind].tones.length > 1 ? TONE_LABELS[slot.tone] : ""}${MOCKUPS[kind].tones.length > 1 && MOCKUPS[kind].sides.length > 1 ? " · " : ""}${MOCKUPS[kind].sides.length > 1 ? MOCKUP_SIDE_LABELS[slot.side] : ""}`;
                      return (
                        <TemplateEditor
                          // A new photo or saved area starts the editor over from the stored values.
                          key={`${key}-${used.src}-${used.area.left}-${used.area.top}-${used.area.width}-${current?.curve ?? ""}`}
                          slot={slot}
                          label={label}
                          src={used.src}
                          area={used.area}
                          custom={Boolean(current)}
                          curve={current?.curve ?? null}
                          storage={storage}
                        />
                      );
                    })}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

export default function AdminMockupBasesPage() {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="SOPORTES." tone="light">
        <p>Elegí qué producto vende cada soporte de los diseños. Cada cambio queda registrado con quién lo hizo.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <MockupBases />
      </Suspense>
    </main>
  );
}
