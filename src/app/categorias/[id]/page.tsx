import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { PageIntro } from "@/components/page-intro";
import { ProductCard } from "@/components/product-card";
import { site } from "@/data/site";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/structured-data";
import { getShopProducts, getStorefrontCategories } from "@/server/storefront";

async function getCategory(id: string) {
  return (await getStorefrontCategories()).find((category) => category.id === id);
}

export async function generateStaticParams() {
  const ids = (await getStorefrontCategories()).map((category) => ({ id: category.id }));
  // Cache Components needs at least one entry: a store without categories prerenders "not found".
  return ids.length ? ids : [{ id: "sin-categorias" }];
}

export async function generateMetadata({ params }: PageProps<"/categorias/[id]">): Promise<Metadata> {
  const { id } = await params;
  const category = await getCategory(id);
  if (!category) return { title: "Categoría no encontrada" };
  return {
    title: category.label,
    description: category.description,
    alternates: { canonical: `/categorias/${category.id}` },
    openGraph: {
      title: `${category.label} — Sublime`,
      description: category.description,
      url: `/categorias/${category.id}`,
      ...(category.image && { images: [{ url: category.image, alt: category.label }] }),
    },
  };
}

export default async function CategoryPage({ params }: PageProps<"/categorias/[id]">) {
  const { id } = await params;
  const category = await getCategory(id);
  if (!category) notFound();
  const products = (await getShopProducts()).filter((product) => product.category === category.id);

  return (
    <main id="contenido" className="page page--light">
      <nav className="breadcrumbs" aria-label="Migas de pan">
        <ol>
          <li>
            <Link href="/categorias">Categorías</Link>
          </li>
          <li aria-current="page">{category.label}</li>
        </ol>
      </nav>
      <PageIntro kicker={category.tagline} title={`${category.label.toUpperCase()}.`} tone="light">
        <p>{category.description}</p>
        <p className="muted">
          {products.length} {products.length === 1 ? "producto" : "productos"}.{" "}
          <Link href={`/tienda?categoria=${category.id}`}>Filtrar por tema o tipo en la tienda</Link>
        </p>
      </PageIntro>
      {products.length > 0 ? (
        <ul className="product-grid">
          {products.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} headingLevel="h2" />
            </li>
          ))}
        </ul>
      ) : (
        <p>Todavía no hay productos en esta categoría.</p>
      )}
      <JsonLd
        data={[
          itemListJsonLd(products, site.url),
          breadcrumbJsonLd(
            [
              { name: "Categorías", path: "/categorias" },
              { name: category.label, path: `/categorias/${category.id}` },
            ],
            site.url,
          ),
        ]}
      />
    </main>
  );
}
