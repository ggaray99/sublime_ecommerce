import type { Metadata } from "next";
import Link from "next/link";
import { MockupStage } from "@/components/designs/mockup-stage";
import { PageIntro } from "@/components/page-intro";
import { MOCKUP_KIND_LABELS } from "@/lib/designs/kinds";
import { toneOfVariant } from "@/lib/designs/mockups";
import { formatPrice } from "@/lib/format";
import { getStorefrontDesigns, getStorefrontProducts } from "@/server/storefront";
import { designOffer } from "./offer";

export const metadata: Metadata = {
  title: "Diseños",
  description: "Elegí un diseño de Sublime y mirá cómo queda en remera, musculosa, taza o sticker antes de comprarlo.",
  alternates: { canonical: "/disenos" },
};

export default async function DesignsPage() {
  const [designs, products] = await Promise.all([getStorefrontDesigns(), getStorefrontProducts()]);
  const offers = designs.map((design) => ({ design, ...designOffer(design, products) })).filter((offer) => offer.bases.length);

  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Diseños" title="ELEGÍ TU DISEÑO." tone="light">
        <p>Cada diseño se puede llevar en distintos productos. Entrá a uno y mirá cómo queda en cada soporte.</p>
      </PageIntro>

      {offers.length === 0 ? (
        <div className="empty-state">
          <h2>Todavía no hay diseños publicados.</h2>
          <p>
            Mientras tanto, recorré la <Link href="/tienda">tienda</Link> o armá tu propio diseño en{" "}
            <Link href="/encargos">Personalizados</Link>.
          </p>
        </div>
      ) : (
        <ul className="product-grid design-grid">
          {offers.map(({ design, bases, from }, index) => {
            const first = bases[0];
            const href = `/disenos/${design.slug}`;
            return (
              <li key={design.id}>
                <article className="product-card design-card">
                  <Link href={href} className="product-card__media design-card__media" tabIndex={-1} aria-hidden="true">
                    <MockupStage
                      kind={first.kind}
                      tone={toneOfVariant(first.product.variants?.[0]?.options ?? {})}
                      side="front"
                      imageUrl={design.imageUrl}
                      width={design.width}
                      height={design.height}
                      alt=""
                      sizes="(max-width: 359px) 100vw, (max-width: 639px) 50vw, (max-width: 1199px) 33vw, 25vw"
                      preload={index < 4}
                    />
                  </Link>
                  <div className="product-card__body">
                    {design.categoryLabel && <p className="product-card__category">{design.categoryLabel}</p>}
                    <h2 className="product-card__title">
                      <Link href={href}>{design.name}</Link>
                    </h2>
                    <p className="design-card__kinds">Disponible en: {bases.map(({ kind }) => MOCKUP_KIND_LABELS[kind]).join(", ")}</p>
                    <p className="product-card__price">{from === null ? "A presupuestar" : `Desde ${formatPrice(from)}`}</p>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
