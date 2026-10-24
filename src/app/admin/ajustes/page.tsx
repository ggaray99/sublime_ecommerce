import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { ContactForm } from "@/components/admin/settings-forms";
import { AdminUnavailable } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { whatsappLink } from "@/server/settings/contact";
import { getContactRepository } from "@/server/settings/session";

export const metadata: Metadata = {
  title: "Ajustes · Administración",
  robots: { index: false, follow: false },
};

async function Settings() {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();
  const contact = await getContactRepository().get();
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
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="AJUSTES." tone="light">
        <p>Datos de contacto del negocio.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <Settings />
      </Suspense>
    </main>
  );
}
