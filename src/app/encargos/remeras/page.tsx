import type { Metadata } from "next";
import Link from "next/link";
import { TshirtLab } from "@/components/lab/tshirt-lab";
import { PageIntro } from "@/components/page-intro";
import { customRequestsAvailable } from "@/server/custom-requests/session";
import { hasPrivateStorage } from "@/server/media/private-files";

export const metadata: Metadata = {
  title: "Remeras a medida",
  description: "Elegí un diseño de Sublime o subí el tuyo, ubicalo en la remera y elegí color y talles.",
  alternates: { canonical: "/encargos/remeras" },
};

export default function TshirtLabPage() {
  const live = customRequestsAvailable() && hasPrivateStorage();
  return (
    <main id="contenido" className="page page--plum">
      <PageIntro
        kicker="Custom Lab · Remeras"
        title={
          <>
            TU REMERA, <em>TU DISEÑO.</em>
          </>
        }
      >
        <p>Elegí uno de nuestros diseños o subí el tuyo, ubicalo y elegí color, lado y talles. El estampado va en un área de hasta 28 × 35 cm.</p>
      </PageIntro>
      {live ? (
        <TshirtLab />
      ) : (
        <div className="empty-state">
          <h2>Muy pronto.</h2>
          <p>El editor de remeras todavía no está habilitado. Mientras tanto, contanos tu idea con el formulario de encargos.</p>
          <div className="actions">
            <Link className="btn btn--acid" href="/encargos#otro">
              Pedir un encargo
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
