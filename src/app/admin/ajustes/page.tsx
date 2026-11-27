import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { ContactForm, InstallmentsForm, LabPricingForm } from "@/components/admin/settings-forms";
import { argentinaTime } from "@/components/orders/order-view";
import { AdminUnavailable, priceInput } from "@/components/admin/shared";
import { formatPrice } from "@/lib/format";
import { estimateSheets } from "@/lib/lab/pricing";
import { PageIntro } from "@/components/page-intro";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { whatsappLink } from "@/server/settings/contact";
import { getContactRepository, getInstallmentsRepository, getLabPricingRepository, getPagesRepository, getStoreStatusRepository } from "@/server/settings/session";
import { INFO_PAGE_SLUGS } from "@/server/settings/pages";
import { infoPages } from "@/data/site";
import { setStoreStatusAction, startPreviewAction } from "./actions";

export const metadata: Metadata = {
  title: "Ajustes · Administración",
  robots: { index: false, follow: false },
};

async function Settings() {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();
  const pagesRepo = getPagesRepository();
  const [contact, pricing, installments, status, pageTexts] = await Promise.all([
    getContactRepository().get(),
    getLabPricingRepository().get(),
    getInstallmentsRepository().get(),
    getStoreStatusRepository().get(),
    Promise.all(INFO_PAGE_SLUGS.map((slug) => pagesRepo.get(slug))),
  ]);
  const savedPages = Object.fromEntries(INFO_PAGE_SLUGS.map((slug, index) => [slug, pageTexts[index] !== null]));
  const examples = [1, ...pricing.tiers.map((tier) => tier.minSheets)].flatMap((sheets) => estimateSheets(pricing, sheets) ?? []);
  const sample = whatsappLink(contact, "Hola, consulto por el encargo ENC-5001");

  return (
    <div className="account account--wide">
      <AdminNav current="ajustes" />
      <section className="account__section" aria-labelledby="estado-title" id="estado">
        <div className="account__head">
          <h2 id="estado-title">Estado de la tienda</h2>
          <span className={`badge ${status.closed ? "badge--pending" : "badge--ok"}`}>{status.closed ? "Cerrada" : "Abierta"}</span>
        </div>
        <p className="muted">
          {status.closed
            ? "Los clientes ven solo la pantalla “Estamos trabajando”. Vos podés recorrer la tienda real con la vista previa, y el panel sigue funcionando."
            : "La tienda está abierta: cualquiera puede ver los productos y hacer pedidos."}
          {status.updatedBy && ` Último cambio: ${status.updatedBy}, ${argentinaTime(status.updatedAt!)}.`}
        </p>
        <div className="admin-toolbar">
          <form action={setStoreStatusAction}>
            <input type="hidden" name="closed" value={String(!status.closed)} />
            <ConfirmButton
              className={status.closed ? "btn btn--acid" : "btn btn--coal"}
              message={
                status.closed
                  ? "¿Abrir la tienda? Desde ahora cualquiera puede ver los productos y hacer pedidos."
                  : "¿Cerrar la tienda? Los clientes van a ver solo “Estamos trabajando” y no van a poder comprar."
              }
            >
              {status.closed ? "Abrir la tienda al público" : "Cerrar la tienda (Estamos trabajando)"}
            </ConfirmButton>
          </form>
          {status.closed && (
            <form action={startPreviewAction}>
              <button type="submit" className="btn btn--ghost">
                Ver la tienda (vista previa)
              </button>
            </form>
          )}
        </div>
        <p className="muted">El cambio llega a todos los visitantes en unos segundos. Queda registrado en Actividad.</p>
      </section>
      <section className="account__section" aria-labelledby="contacto-title">
        <h2 id="contacto-title">Contacto</h2>
        <p className="muted">
          Se muestran en el pie de todas las páginas; los datos vacíos no aparecen. Con un WhatsApp cargado, los encargos
          muestran un botón con el número de encargo ya escrito en el mensaje.
        </p>
        <ContactForm contact={contact} />
        {sample && (
          <p className="muted">
            Probalo:{" "}
            <a href={sample} target="_blank" rel="noopener noreferrer">
              abrir WhatsApp con un mensaje de ejemplo
            </a>
          </p>
        )}
      </section>

      <section className="account__section" aria-labelledby="paginas-title" id="paginas">
        <h2 id="paginas-title">Páginas informativas</h2>
        <p className="muted">Los textos que todavía dicen “Pendiente” o “A definir” muestran una etiqueta en la tienda hasta que los cargues.</p>
        <ul className="address-list">
          {INFO_PAGE_SLUGS.map((slug) => (
            <li key={slug} className="address-card">
              <p className="address-card__title">
                <Link href={`/admin/ajustes/paginas/${slug}`}>{infoPages[slug].title}</Link>
                {!savedPages[slug] && <span className="badge badge--pending">Texto de ejemplo</span>}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="account__section" aria-labelledby="cuotas-title" id="cuotas">
        <div className="account__head">
          <h2 id="cuotas-title">Cuotas</h2>
          <span className={`badge ${installments.enabled ? "badge--ok" : "badge--pending"}`}>{installments.enabled ? "Se muestran" : "No se muestran"}</span>
        </div>
        <p className="muted">
          Con las cuotas activadas, cada producto muestra “{installments.count} cuotas sin interés de …” debajo del precio y en
          Medios de pago. Activalas solo si realmente las ofrecés en Mercado Pago: la tienda no calcula intereses ni cobra en
          cuotas por su cuenta.
        </p>
        <InstallmentsForm
          initial={{ enabled: installments.enabled, count: String(installments.count), minAmount: installments.minAmount ? String(installments.minAmount) : "" }}
        />
      </section>

      <section className="account__section" aria-labelledby="stickers-title">
        <h2 id="stickers-title">Precio de stickers a medida</h2>
        <p className="muted">
          El editor de stickers muestra una estimación con estos valores (planchas de 21 × 29 cm). Es orientativa: el presupuesto
          final lo confirmás vos.
        </p>
        <LabPricingForm
          initial={{
            sheetPrice: pricing.sheetPriceMinor ? priceInput(pricing.sheetPriceMinor) : "",
            tiers: pricing.tiers.map((tier) => ({ min: String(tier.minSheets), percent: String(tier.percent) })),
          }}
        />
        {examples.length > 0 && (
          <p className="muted">
            Hoy:{" "}
            {examples
              .map((example) => `${example.sheets} ${example.sheets === 1 ? "plancha" : "planchas"} a ${formatPrice(example.unitMinor / 100)} c/u`)
              .join(" · ")}
          </p>
        )}
      </section>
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="Ajustes" tone="light">
        <p>Datos de contacto, cuotas y precios del Custom Lab.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <Settings />
      </Suspense>
    </main>
  );
}
