import type { Metadata } from "next";
import { Suspense } from "react";
import { PageIntro } from "@/components/page-intro";
import { QuoteForm } from "@/components/quote-form";

export const metadata: Metadata = {
  title: "Encargos personalizados",
  description: "Simulá un pedido de stickers, etiquetas, remeras o vinilos a medida. Formulario demo: no envía datos.",
  alternates: { canonical: "/encargos" },
};

export default function EncargosPage() {
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
          Contanos qué querés hacer. Este formulario valida tus datos y muestra cómo sería la confirmación, pero no envía
          nada a ningún negocio.
        </p>
      </PageIntro>
      <div className="quote-layout">
        <Suspense fallback={<p className="panel panel--muted">Cargando formulario…</p>}>
          <QuoteForm />
        </Suspense>
        <aside className="quote-aside" aria-labelledby="quote-aside-title">
          <h2 id="quote-aside-title">Qué pasaría después</h2>
          <ol>
            <li>Revisión de la idea, el formato y la cantidad.</li>
            <li>Propuesta con valores y tiempos estimados.</li>
            <li>Aprobación del diseño antes de producir.</li>
          </ol>
          <p>
            <span className="badge badge--pending">Canal de presupuestos pendiente</span>
          </p>
          <p className="fine-print">Los pasos son una referencia: el proceso comercial real todavía no está definido.</p>
        </aside>
      </div>
    </main>
  );
}
