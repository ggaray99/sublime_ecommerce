import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartPanel } from "@/components/cart/add-to-cart";
import { ProductCard } from "@/components/product-card";
import { ProductGallery } from "@/components/product-gallery";
import { categoryById } from "@/data/categories";
import { productBySlug, products, themes } from "@/data/products";
import { relatedProducts } from "@/lib/catalog";
import { priceLabel } from "@/lib/format";

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: PageProps<"/producto/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = productBySlug(slug);
  if (!product) return { title: "Producto no encontrado" };
  return {
    title: product.name,
    description: `${product.description} Producto de demostración con precio ilustrativo.`,
    alternates: { canonical: `/producto/${product.slug}` },
    openGraph: {
      title: `${product.name} — Sublime (demo)`,
      description: product.description,
      url: `/producto/${product.slug}`,
    },
  };
}

export default async function ProductPage({ params }: PageProps<"/producto/[slug]">) {
  const { slug } = await params;
  const product = productBySlug(slug);
  if (!product) notFound();

  const category = categoryById(product.category);
  const related = relatedProducts(products, product);

  return (
    <main id="contenido" className="page page--light">
      <nav className="breadcrumbs" aria-label="Migas de pan">
        <ol>
          <li>
            <Link href="/tienda">Tienda</Link>
          </li>
          <li>
            <Link href={`/tienda?categoria=${product.category}`}>{category?.label}</Link>
          </li>
          <li aria-current="page">{product.name}</li>
        </ol>
      </nav>

      <div className="product-detail">
        <ProductGallery images={product.images} name={product.name} />

        <div className="product-detail__info">
          <p className="kicker">
            {category?.label} · {themes[product.theme]}
          </p>
          <h1>{product.name}</h1>
          <p className="product-detail__price">
            {priceLabel(product.price)}
            <span className="badge badge--violet">{product.price === null ? "Se cotiza a pedido" : "Precio demo"}</span>
          </p>
          <p className="product-detail__description">{product.description}</p>
          {product.code && (
            <p className="product-detail__code">
              Código de catálogo: <strong>{product.code}</strong>
            </p>
          )}

          {product.availableForDirectPurchase ? (
            <AddToCartPanel productId={product.id} productName={product.name} />
          ) : (
            <div className="purchase purchase--quote">
              <p>Este producto se hace a medida. Contanos tu idea y simulá una solicitud de presupuesto.</p>
              <Link className="btn btn--violet btn--lg" href={`/encargos?producto=${product.slug}`}>
                Solicitar presupuesto demo
              </Link>
            </div>
          )}

          <ul className="tag-list" aria-label="Etiquetas">
            {product.tags.map((tag) => (
              <li key={tag}>
                <Link href={`/tienda?q=${encodeURIComponent(tag)}`}>#{tag}</Link>
              </li>
            ))}
          </ul>

          <section className="details-box" aria-labelledby="details-title">
            <h2 id="details-title">
              Material y uso <span className="badge badge--pending">Información ilustrativa</span>
            </h2>
            <ul>
              {product.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </section>

          <p className="fine-print">
            Producto de demostración. No se informa stock, plazos de producción ni características técnicas definitivas.
          </p>
        </div>
      </div>

      {related.length > 0 && (
        <section className="related" aria-labelledby="related-title">
          <h2 id="related-title">TAMBIÉN TE PUEDE GUSTAR</h2>
          <ul className="product-grid">
            {related.map((item) => (
              <li key={item.id}>
                <ProductCard product={item} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
