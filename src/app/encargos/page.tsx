import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageIntro } from "@/components/page-intro";
import { QuoteForm } from "@/components/quote-form";
import { customRequestsAvailable } from "@/server/custom-requests/session";
import { hasPrivateStorage } from "@/server/media/private-files";

export const metadata: Metadata = {
  title: "Encargos personalizados",
  description: "Pedí stickers, etiquetas, remeras o vinilos a medida: contanos tu idea y te pasamos un presupuesto.",
  alternates: { canonical: "/encargos" },
};

export default function EncargosPage() {
  const live = customRequestsAvailable();
  const lab = live && hasPrivateStorage();
  return (
    <main id="contenido" className="page page--plum">
      <PageIntro
        kicker="Encargo personalizado"
        title={
          <>
            NO ENTRA EN <em>UN CUADRADO.</em>
          </>
        }
      >
        <p>
          {live
            ? "Diseñá tus stickers o tu remera en el Custom Lab, o contanos cualquier otra idea. Te respondemos con un presupuesto."
            : "Contanos qué querés hacer. Este formulario valida tus datos y muestra cómo sería la confirmación, pero no envía nada a ningún negocio."}
        </p>
      </PageIntro>
      {lab && (
        <ul className="lab-paths" aria-label="Elegí qué querés hacer">
          <li>
            <Link href="/encargos/stickers" className="lab-path">
              <span className="lab-path__kicker">Custom Lab</span>
              <strong>Stickers troquelados</strong>
              <span>Subí tu diseño, elegí tamaño y cantidad, y mirá el borde blanco y tus planchas al instante.</span>
              <span className="lab-path__cta">Diseñar stickers →</span>
            </Link>
          </li>
          <li>
            <Link href="/encargos/remeras" className="lab-path">
              <span className="lab-path__kicker">Custom Lab</span>
              <strong>Remeras</strong>
              <span>Elegí un diseño nuestro o subí el tuyo, ubicalo en la remera y elegí color y talle.</span>
              <span className="lab-path__cta">Diseñar remera →</span>
            </Link>
          </li>
          <li>
            <a href="#otro" className="lab-path lab-path--plain">
              <span className="lab-path__kicker">Encargo libre</span>
              <strong>Otra idea</strong>
              <span>Etiquetas, vinilos, packs o lo que imagines: contanos y lo cotizamos.</span>
              <span className="lab-path__cta">Ir al formulario ↓</span>
            </a>
          </li>
        </ul>
      )}
      <div className="quote-layout" id="otro">
        <Suspense fallback={<p className="panel panel--muted">Cargando formulario…</p>}>
          <QuoteForm live={live} uploads={live && hasPrivateStorage()} />
        </Suspense>
        <aside className="quote-aside" aria-labelledby="quote-aside-title">
          <h2 id="quote-aside-title">Qué pasaría después</h2>
          <ol>
            <li>Revisión de la idea, el formato y la cantidad.</li>
            <li>Propuesta con valores y tiempos estimados.</li>
            <li>Aprobación del diseño antes de producir.</li>
          </ol>
          {!live && (
            <>
              <p>
                <span className="badge badge--pending">Canal de presupuestos pendiente</span>
              </p>
              <p className="fine-print">Los pasos son una referencia: el proceso comercial real todavía no está definido.</p>
            </>
          )}
          {live && <p className="fine-print">Seguís el estado del encargo con el enlace que te damos al enviarlo, o desde Mi cuenta.</p>}
        </aside>
      </div>
    </main>
  );
}
