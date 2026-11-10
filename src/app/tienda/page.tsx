import type { Metadata } from "next";
import { Suspense } from "react";
import { PageIntro } from "@/components/page-intro";
import { ProductCard } from "@/components/product-card";
import { Shop } from "@/components/shop";
import type { Product } from "@/data/products";
import { getStorefrontCategories, getStorefrontProducts } from "@/server/storefront";
import { forClient } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Tienda",
  description: "Catálogo de Sublime: calcos, packs de stickers, remeras, planchas DTF, vinilos y productos a medida.",
  alternates: { canonical: "/tienda" },
};

/** Static fallback while the URL-driven filters load: the full catalog, unfiltered. */
function CatalogFallback({ products }: { products: Product[] }) {
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

export default async function TiendaPage() {
  const [all, categories] = await Promise.all([getStorefrontProducts(), getStorefrontCategories()]);
  // The grid and its search only need names, tags, prices and the cover photo.
  const products = all.map((product) => forClient(product, { tags: true }));
  return (
    <main id="contenido" className="page">
      <PageIntro
        kicker="Catálogo"
        title={
          <>
            TIENDA <em>SUBLIME.</em>
          </>
        }
      >
        <p>
          {products.length} productos: calcos, packs, remeras, DTF, vinilos y encargos a medida. Los stickers del catálogo
          también se buscan por código.
        </p>
      </PageIntro>
      <Suspense fallback={<CatalogFallback products={products} />}>
        <Shop products={products} categories={categories} />
      </Suspense>
    </main>
  );
}
