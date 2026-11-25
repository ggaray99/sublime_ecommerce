import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DesignCatalog } from "@/components/designs/design-catalog";
import { DesignGrid, type DesignCard } from "@/components/designs/design-grid";
import { PageIntro } from "@/components/page-intro";
import { garmentColors } from "@/lib/designs/mockups";
import { getMockupTemplateOverrides, getStorefrontDesigns, getStorefrontProducts } from "@/server/storefront";
import { designOffer } from "./offer";

export const metadata: Metadata = {
  title: "Diseños",
  description: "Elegí un diseño de Sublime y mirá cómo queda en remera, musculosa, taza o sticker antes de comprarlo.",
  alternates: { canonical: "/disenos" },
};

export default async function DesignsPage() {
  const [designs, products, overrides] = await Promise.all([getStorefrontDesigns(), getStorefrontProducts(), getMockupTemplateOverrides()]);
  const cards: DesignCard[] = designs.flatMap((design) => {
    const { bases, from } = designOffer(design, products);
    if (!bases.length) return [];
    return [
      {
        id: design.id,
        slug: design.slug,
        name: design.name,
        categoryLabel: design.categoryLabel,
        imageUrl: design.imageUrl,
        width: design.width,
        height: design.height,
        from,
        // designOffer keeps only the variants in colors enabled for the design.
        bases: bases.map(({ kind, product }) => ({ kind, colors: garmentColors(product.variants ?? []) })),
        themes: design.themes,
      },
    ];
  });

  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Diseños" title="ELEGÍ TU DISEÑO." tone="light">
        <p>Cada diseño se puede llevar en distintos productos. Entrá a uno y mirá cómo queda en cada soporte.</p>
      </PageIntro>

      {cards.length === 0 ? (
        <div className="empty-state">
          <h2>Todavía no hay diseños publicados.</h2>
          <p>
            Mientras tanto, recorré la <Link href="/tienda">tienda</Link> o armá tu propio diseño en{" "}
            <Link href="/encargos">Personalizados</Link>.
          </p>
        </div>
      ) : (
        // The filters read the URL; until then the full list shows, unfiltered.
        <Suspense fallback={<DesignGrid cards={cards} overrides={overrides} />}>
          <DesignCatalog cards={cards} overrides={overrides} />
        </Suspense>
      )}
    </main>
  );
}
