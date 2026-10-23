import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { getStorefrontCategories, getStorefrontProducts } from "@/server/storefront";

export const metadata: Metadata = {
  title: "Categorías",
  description: "Calcos y stickers, packs, indumentaria, DTF, vinilos y personalizados: los formatos de la tienda demo de Sublime.",
  alternates: { canonical: "/categorias" },
};

export default async function CategoriasPage() {
  const [products, categories] = await Promise.all([getStorefrontProducts(), getStorefrontCategories()]);
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Formatos" title="CATEGORÍAS." tone="light">
        <p>Distintas maneras de llevar un diseño a un objeto. Todo el contenido es de demostración.</p>
      </PageIntro>
      <ul className="category-list">
        {categories.map((category) => {
          const count = products.filter((product) => product.category === category.id).length;
          return (
            <li key={category.id} className="category-row">
              <Image src={category.image} alt="" width={800} height={800} sizes="(max-width: 767px) 100vw, 320px" />
              <div>
                <h2>{category.label}</h2>
                <p>{category.description}</p>
                <p className="muted">
                  {count} {count === 1 ? "producto demo" : "productos demo"}
                </p>
                <Link className="btn btn--coal" href={`/tienda?categoria=${category.id}`}>
                  Ver {category.label.toLowerCase()}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
