import type { Metadata } from "next";
import { Suspense } from "react";
import { PageIntro } from "@/components/page-intro";
import { ProductCard } from "@/components/product-card";
import { Shop } from "@/components/shop";
import { products } from "@/data/products";

export const metadata: Metadata = {
  title: "Tienda",
  description: "Catálogo demo de Sublime: calcos, packs de stickers, remeras, planchas DTF, vinilos y productos a medida.",
  alternates: { canonical: "/tienda" },
};

/** Static fallback while the URL-driven filters load: the full catalog, unfiltered. */
function CatalogFallback() {
  return (
    <ul className="product-grid">
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} headingLevel="h2" />
        </li>
      ))}
    </ul>
  );
}

export default function TiendaPage() {
  return (
    <main id="contenido" className="page">
      <PageIntro
        kicker="Catálogo demo"
        title={
          <>
            TIENDA <em>SUBLIME.</em>
          </>
        }
      >
        <p>
          {products.length} productos para probar la experiencia: diseños demo y una selección del catálogo de stickers
          (buscalos por código). Los precios son ilustrativos y no hay stock ni ventas reales.
        </p>
      </PageIntro>
      <Suspense fallback={<CatalogFallback />}>
        <Shop />
      </Suspense>
    </main>
  );
}
