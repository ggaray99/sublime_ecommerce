import Image from "next/image";
import { memo } from "react";
import Link from "next/link";
import type { Product } from "@/data/products";
import { categoryLabelOf, hasPriceRange, isOutOfStock } from "@/lib/catalog";
import { priceLabel } from "@/lib/format";
import { AddToCartButton } from "./cart/add-to-cart";

type Props = { product: Product; headingLevel?: "h2" | "h3"; preload?: boolean };

function ProductCardView({ product, headingLevel = "h3", preload = false }: Props) {
  const Heading = headingLevel;
  const href = `/producto/${product.slug}`;
  const cover = product.images[0];

  return (
    <article className="product-card">
      <Link href={href} className="product-card__media" tabIndex={-1} aria-hidden="true">
        <Image
          src={cover.src}
          alt=""
          width={800}
          height={800}
          sizes="(max-width: 359px) 100vw, (max-width: 639px) 50vw, (max-width: 1199px) 33vw, 25vw"
          preload={preload}
        />
        <span className="product-card__badges">
          {product.regularPrice && <span className="badge badge--sale">Oferta</span>}
          {product.featured && <span className="badge badge--acid">Destacado</span>}
          {product.requiresQuote && <span className="badge badge--violet">A medida</span>}
          {isOutOfStock(product) && <span className="badge badge--pending">Sin stock</span>}
        </span>
      </Link>
      <div className="product-card__body">
        <p className="product-card__category">
          {categoryLabelOf(product)}
          {product.code && ` · Cód. ${product.code}`}
        </p>
        <Heading className="product-card__title">
          <Link href={href}>{product.name}</Link>
        </Heading>
        <p className="product-card__price">
          {hasPriceRange(product) && <span className="product-card__from">desde </span>}
          {product.regularPrice && (
            <s className="price-was">
              <span className="visually-hidden">Antes </span>
              {priceLabel(product.regularPrice)}
            </s>
          )}
          {product.regularPrice && <span className="visually-hidden">Ahora </span>}
          {priceLabel(product.price)}
        </p>
        <div className="product-card__actions">
          {isOutOfStock(product) ? (
            <p className="product-card__out">Sin stock por ahora</p>
          ) : product.availableForDirectPurchase && product.variants ? (
            <Link className="btn btn--acid btn--block" href={href}>
              Elegir {product.optionNames?.join(" y ").toLowerCase() ?? "opción"}
              <span className="visually-hidden">: {product.name}</span>
            </Link>
          ) : product.availableForDirectPurchase ? (
            <AddToCartButton productId={product.id} productName={product.name} />
          ) : (
            <Link className="btn btn--violet btn--block" href={`/encargos?producto=${product.slug}`}>
              Pedir presupuesto
            </Link>
          )}
          <Link className="btn btn--ghost btn--block" href={href}>
            Ver producto<span className="visually-hidden">: {product.name}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

/** Memoized: the shop grid re-renders on every search keystroke, cards only when their product changes. */
export const ProductCard = memo(ProductCardView);
