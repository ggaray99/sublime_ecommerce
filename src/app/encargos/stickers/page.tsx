import type { Metadata } from "next";
import Link from "next/link";
import { StickerLab } from "@/components/lab/sticker-lab";
import { PageIntro } from "@/components/page-intro";
import { customRequestsAvailable } from "@/server/custom-requests/session";
import { hasPrivateStorage } from "@/server/media/private-files";

export const metadata: Metadata = {
  title: "Stickers a medida",
  description: "Subí tu diseño, elegí el tamaño y la cantidad, y mirá cómo quedan tus stickers troquelados con borde blanco.",
  alternates: { canonical: "/encargos/stickers" },
};

export default function StickerLabPage() {
  const live = customRequestsAvailable() && hasPrivateStorage();
  return (
    <main id="contenido" className="page page--plum">
      <PageIntro
        kicker="Custom Lab · Stickers"
        title={
          <>
            TU DISEÑO, <em>TROQUELADO.</em>
          </>
        }
      >
        <p>Subí tus imágenes, elegí el tamaño (de 4 a 6 cm) y la cantidad. Te mostramos el borde blanco y cómo se arman tus planchas.</p>
      </PageIntro>
      {live ? (
        <StickerLab />
      ) : (
        <div className="empty-state">
          <h2>Muy pronto.</h2>
          <p>El editor de stickers todavía no está habilitado. Mientras tanto, contanos tu idea con el formulario de encargos.</p>
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
