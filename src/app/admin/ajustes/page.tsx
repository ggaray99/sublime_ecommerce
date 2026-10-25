import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { ContactForm, LabPricingForm } from "@/components/admin/settings-forms";
import { AdminUnavailable, priceInput } from "@/components/admin/shared";
import { formatPrice } from "@/lib/format";
import { estimateSheets } from "@/lib/lab/pricing";
import { PageIntro } from "@/components/page-intro";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { whatsappLink } from "@/server/settings/contact";
import { getContactRepository, getLabPricingRepository } from "@/server/settings/session";

export const metadata: Metadata = {
  title: "Ajustes · Administración",
  robots: { index: false, follow: false },
};

async function Settings() {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();
  const [contact, pricing] = await Promise.all([getContactRepository().get(), getLabPricingRepository().get()]);
  const examples = [1, ...pricing.tiers.map((tier) => tier.minSheets)].flatMap((sheets) => estimateSheets(pricing, sheets) ?? []);
  const sample = whatsappLink(contact, "Hola, consulto por el encargo ENC-5001");

  return (
    <div className="account account--wide">
      <AdminNav current="ajustes" />
      <section className="account__section" aria-labelledby="contacto-title">
        <h2 id="contacto-title">Contacto</h2>
        <p className="muted">
          Con un número cargado, los encargos muestran un botón de WhatsApp con el número de encargo ya escrito en el mensaje.
        </p>
        <ContactForm whatsapp={contact.whatsapp} />
        {sample && (
          <p className="muted">
            Probalo:{" "}
            <a href={sample} target="_blank" rel="noopener noreferrer">
              abrir WhatsApp con un mensaje de ejemplo
            </a>
          </p>
        )}
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
      <PageIntro kicker="Administración" title="AJUSTES." tone="light">
        <p>Datos de contacto y precios del Custom Lab.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <Settings />
      </Suspense>
    </main>
  );
}
