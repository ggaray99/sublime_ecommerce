import Image from "next/image";
import Link from "next/link";
import { categoryById } from "@/data/categories";
import type { Product } from "@/data/products";
import { priceLabel } from "@/lib/format";
import { AddToCartButton } from "./cart/add-to-cart";

type Props = { product: Product; headingLevel?: "h2" | "h3"; preload?: boolean };

export function ProductCard({ product, headingLevel = "h3", preload = false }: Props) {
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
          sizes="(max-width: 559px) 100vw, (max-width: 1023px) 50vw, 25vw"
          preload={preload}
        />
        <span className="product-card__badges">
          {product.featured && <span className="badge badge--acid">Destacado</span>}
          {product.requiresQuote && <span className="badge badge--violet">A medida</span>}
        </span>
      </Link>
      <div className="product-card__body">
        <p className="product-card__category">
          {categoryById(product.category)?.label}
          {product.code && ` · Cód. ${product.code}`}
        </p>
        <Heading className="product-card__title">
          <Link href={href}>{product.name}</Link>
        </Heading>
        <p className="product-card__price">
          {priceLabel(product.price)}
          <span className="product-card__demo">{product.price === null ? "demo" : "precio demo"}</span>
        </p>
        <div className="product-card__actions">
          {product.availableForDirectPurchase ? (
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
