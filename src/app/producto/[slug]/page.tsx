import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartPanel } from "@/components/cart/add-to-cart";
import { VariantPurchase } from "@/components/cart/variant-purchase";
import { ProductCard } from "@/components/product-card";
import { ProductGallery } from "@/components/product-gallery";
import { themes, type Product } from "@/data/products";
import { categoryLabelOf, hasPriceRange, isOutOfStock, relatedProducts } from "@/lib/catalog";
import { priceLabel } from "@/lib/format";
import { getStorefrontProduct, getStorefrontProducts } from "@/server/storefront";

export async function generateStaticParams() {
  return (await getStorefrontProducts()).map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: PageProps<"/producto/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getStorefrontProduct(slug);
  if (!product) return { title: "Producto no encontrado" };
  return {
    title: product.name,
    description: product.description,
    alternates: { canonical: `/producto/${product.slug}` },
    openGraph: {
      title: `${product.name} — Sublime`,
      description: product.description,
      url: `/producto/${product.slug}`,
    },
  };
}

/** Stock line, only where the database provides it (staging/previews). */
function StockNote({ product }: { product: Product }) {
  if (product.stock === undefined || product.requiresQuote) return null;
  if (product.stock === null) return <p className="stock-note">Se fabrica a pedido.</p>;
  if (product.stock === 0) return <p className="stock-note stock-note--out">Sin stock por ahora.</p>;
  return (
    <p className="stock-note stock-note--in">
      Stock disponible: {product.stock} {product.stock === 1 ? "unidad" : "unidades"}
    </p>
  );
}

export default async function ProductPage({ params }: PageProps<"/producto/[slug]">) {
  const { slug } = await params;
  // Hidden (draft/archived) products disappear from the store as well.
  const product = await getStorefrontProduct(slug);
  if (!product) notFound();

  const categoryLabel = categoryLabelOf(product);
  // Products with options (talle, color…) pick a variant; made-to-order ones keep the quote flow.
  const withVariants = Boolean(product.variants?.length) && product.availableForDirectPurchase;
  const related = relatedProducts(await getStorefrontProducts(), product);

  return (
    <main id="contenido" className="page page--light">
      <nav className="breadcrumbs" aria-label="Migas de pan">
        <ol>
          <li>
            <Link href="/tienda">Tienda</Link>
          </li>
          <li>
            <Link href={`/tienda?categoria=${product.category}`}>{categoryLabel}</Link>
          </li>
          <li aria-current="page">{product.name}</li>
        </ol>
      </nav>

      <div className="product-detail">
        <ProductGallery images={product.images} name={product.name} />

        <div className="product-detail__info">
          <p className="kicker">
            {categoryLabel} · {themes[product.theme]}
          </p>
          <h1>{product.name}</h1>
          {withVariants ? (
            hasPriceRange(product) && <p className="muted">Desde {priceLabel(product.price)} según la opción.</p>
          ) : (
            <>
              <p className="product-detail__price">
                {product.regularPrice && (
                  <s className="price-was">
                    <span className="visually-hidden">Antes </span>
                    {priceLabel(product.regularPrice)}
                  </s>
                )}
                {priceLabel(product.price)}
                {product.regularPrice && <span className="badge badge--sale">Oferta</span>}
                {product.price === null && <span className="badge badge--violet">Se cotiza a pedido</span>}
              </p>
              <StockNote product={product} />
            </>
          )}
          <p className="product-detail__description">{product.description}</p>
          {product.code && (
            <p className="product-detail__code">
              Código de catálogo: <strong>{product.code}</strong>
            </p>
          )}

          {withVariants && product.variants && product.optionNames ? (
            <VariantPurchase productId={product.id} productName={product.name} optionNames={product.optionNames} variants={product.variants} />
          ) : isOutOfStock(product) ? (
            <div className="purchase purchase--quote">
              <p>Este producto está sin stock. Volvé a consultar más adelante.</p>
            </div>
          ) : product.availableForDirectPurchase ? (
            <AddToCartPanel productId={product.id} productName={product.name} />
          ) : (
            <div className="purchase purchase--quote">
              <p>Este producto se hace a medida. Contanos tu idea y te pasamos un presupuesto.</p>
              <Link className="btn btn--violet btn--lg" href={`/encargos?producto=${product.slug}`}>
                Solicitar presupuesto
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
              Material y uso
            </h2>
            <ul>
              {product.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </section>

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
