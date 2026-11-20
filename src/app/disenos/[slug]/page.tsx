import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DesignMockup, type DesignBaseOption } from "@/components/designs/design-mockup";
import { JsonLd } from "@/components/json-ld";
import { site } from "@/data/site";
import { MOCKUP_KIND_LABELS } from "@/lib/designs/kinds";
import { breadcrumbJsonLd } from "@/lib/structured-data";
import { getMockupTemplateOverrides, getStorefrontDesign, getStorefrontDesigns, getStorefrontProducts } from "@/server/storefront";
import { designOffer } from "../offer";

export async function generateStaticParams() {
  const slugs = (await getStorefrontDesigns()).map((design) => ({ slug: design.slug }));
  // Cache Components needs at least one entry. Without published designs this
  // placeholder prerenders as "not found", and real designs render on request.
  return slugs.length ? slugs : [{ slug: "sin-disenos" }];
}

export async function generateMetadata({ params }: PageProps<"/disenos/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const design = await getStorefrontDesign(slug);
  if (!design) return { title: "Diseño no encontrado" };
  const kinds = design.bases.map(({ kind }) => MOCKUP_KIND_LABELS[kind].toLowerCase()).join(", ");
  const description = design.description || `Diseño ${design.name} disponible en ${kinds}.`;
  return {
    title: design.name,
    description,
    alternates: { canonical: `/disenos/${design.slug}` },
    openGraph: {
      title: `${design.name} — Sublime`,
      description,
      url: `/disenos/${design.slug}`,
      ...(design.imageUrl && { images: [{ url: design.imageUrl, alt: design.name }] }),
    },
  };
}

export default async function DesignPage({ params }: PageProps<"/disenos/[slug]">) {
  const { slug } = await params;
  const design = await getStorefrontDesign(slug);
  if (!design) notFound();
  const [products, overrides] = await Promise.all([getStorefrontProducts(), getMockupTemplateOverrides()]);
  const { bases } = designOffer(design, products);
  if (!bases.length) notFound();

  const options: DesignBaseOption[] = bases.map(({ kind, product }) => ({
    kind,
    productId: product.id,
    optionNames: product.optionNames ?? [],
    variants: product.variants ?? [],
    price: product.price,
    stock: product.stock,
    purchasable: product.availableForDirectPurchase && !product.requiresQuote,
  }));

  return (
    <main id="contenido" className="page page--light">
      <nav className="breadcrumbs" aria-label="Migas de pan">
        <ol>
          <li>
            <Link href="/disenos">Diseños</Link>
          </li>
          <li aria-current="page">{design.name}</li>
        </ol>
      </nav>

      <header className="design-detail__header">
        {design.categoryLabel && <p className="kicker">{design.categoryLabel}</p>}
        <h1>{design.name}</h1>
        {design.description && <p className="product-detail__description">{design.description}</p>}
        <p className="muted">Elegí el producto y mirá cómo queda el diseño antes de sumarlo al carrito.</p>
      </header>

      <DesignMockup
        design={{ id: design.id, name: design.name, imageUrl: design.imageUrl, width: design.width, height: design.height, opaque: design.opaque }}
        bases={options}
        overrides={overrides}
      />

      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: "Diseños", path: "/disenos" },
            { name: design.name, path: `/disenos/${design.slug}` },
          ],
          site.url,
        )}
      />
    </main>
  );
}
