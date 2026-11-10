import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { PointsMap } from "@/components/points/points-map";
import { getPublicPoints } from "@/server/points/session";

export const metadata: Metadata = {
  title: "Dónde comprar",
  description: "Locales y puntos de venta donde conseguir calcos, stickers y productos Sublime, con mapa y cómo llegar.",
  alternates: { canonical: "/puntos" },
};

export default async function PuntosPage() {
  const points = await getPublicPoints();
  return (
    <main id="contenido" className="page">
      <PageIntro
        kicker="Dónde comprar"
        title={
          <>
            PUNTOS DE <em>VENTA.</em>
          </>
        }
      >
        <p>Lugares donde vas a encontrar productos Sublime. Elegí uno para verlo en el mapa y saber cómo llegar.</p>
      </PageIntro>
      {points.length ? (
        <PointsMap points={points} />
      ) : (
        <div className="empty-state">
          <h2>Muy pronto.</h2>
          <p>Estamos sumando locales. Mientras tanto, podés comprar online.</p>
          <div className="actions">
            <Link className="btn btn--acid" href="/tienda">
              Ir a la tienda
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
