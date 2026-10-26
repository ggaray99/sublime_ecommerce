import type { Metadata } from "next";
import Image from "next/image";
import { getContactSettings } from "@/server/settings/session";
import { whatsappLink } from "@/server/settings/contact";

export const metadata: Metadata = {
  title: "Estamos trabajando",
  description: "Sublime está preparando su nueva tienda online.",
  robots: { index: false, follow: false },
};

/**
 * What the public sees while SUBLIME_MAINTENANCE=1 (src/proxy.ts rewrites every
 * public page here). Covers the site header and footer: nothing else shows.
 * The WhatsApp link appears once a number is set in /admin/ajustes.
 */
export default async function MaintenancePage() {
  const whatsapp = whatsappLink(await getContactSettings(), "Hola Sublime, quería hacer una consulta.");
  return (
    <main id="contenido" className="maintenance">
      <div className="maintenance__box">
        <Image src="/brand/sublime-logo.png" alt="Sublime" width={640} height={179} sizes="260px" preload className="maintenance__logo" />
        <h1>
          ESTAMOS <em>TRABAJANDO.</em>
        </h1>
        <p>Estamos preparando la nueva tienda de Sublime. Muy pronto vas a poder comprar calcos, stickers, remeras y encargos a medida desde acá.</p>
        {whatsapp && (
          <a className="btn btn--acid" href={whatsapp} target="_blank" rel="noopener noreferrer">
            Escribinos por WhatsApp
          </a>
        )}
      </div>
    </main>
  );
}
