"use client";

import Image from "next/image";
import Link from "next/link";
import { MAX_QUANTITY } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import { categoryById } from "@/data/categories";
import { cartActions, useCartSummary, useHydrated } from "./cart-store";
import { QuantityStepper } from "./quantity-stepper";

export function CartView() {
  const hydrated = useHydrated();
  const { items, count, subtotal } = useCartSummary();

  if (!hydrated) {
    return <p className="panel panel--muted">Cargando tu carrito demo…</p>;
  }

  if (!items.length) {
    return (
      <div className="empty-state">
        <h2>Tu carrito demo está vacío.</h2>
        <p>Sumá calcos, packs o remeras desde la tienda para probar cómo funciona.</p>
        <div className="actions">
          <Link className="btn btn--acid" href="/tienda">
            Explorar la tienda
          </Link>
          <Link className="btn btn--ghost" href="/encargos">
            Pedir un personalizado
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-layout">
      <section aria-labelledby="cart-items-title">
        <h2 id="cart-items-title" className="visually-hidden">
          Artículos en el carrito
        </h2>
        <ul className="cart-list">
          {items.map(({ product, quantity, lineTotal }) => (
            <li key={product.id} className="cart-item">
              <Link href={`/producto/${product.slug}`} className="cart-item__image" tabIndex={-1} aria-hidden="true">
                <Image src={product.images[0].src} alt="" width={160} height={160} />
              </Link>
              <div className="cart-item__info">
                <p className="kicker">{categoryById(product.category)?.label}</p>
                <h3>
                  <Link href={`/producto/${product.slug}`}>{product.name}</Link>
                </h3>
                <p className="muted">{formatPrice(product.price ?? 0)} c/u · precio demo</p>
              </div>
              <div className="cart-item__controls">
                <QuantityStepper
                  label={`Cantidad de ${product.name}`}
                  value={quantity}
                  min={1}
                  max={MAX_QUANTITY}
                  onChange={(next) => cartActions.setQuantity(product.id, next)}
                />
                <button type="button" className="link-button" onClick={() => cartActions.remove(product.id)}>
                  Quitar<span className="visually-hidden"> {product.name}</span>
                </button>
              </div>
              <p className="cart-item__total">{formatPrice(lineTotal)}</p>
            </li>
          ))}
        </ul>
      </section>

      <aside className="summary" aria-labelledby="cart-summary-title">
        <h2 id="cart-summary-title">Resumen demo</h2>
        <dl>
          <div>
            <dt>Artículos</dt>
            <dd>{count}</dd>
          </div>
          <div>
            <dt>Subtotal</dt>
            <dd>{formatPrice(subtotal)}</dd>
          </div>
          <div>
            <dt>Envío</dt>
            <dd>A definir</dd>
          </div>
          <div className="summary__total">
            <dt>Total demo</dt>
            <dd>{formatPrice(subtotal)}</dd>
          </div>
        </dl>
        <Link className="btn btn--acid btn--block btn--lg" href="/checkout">
          Ir al checkout demo
        </Link>
        <p className="fine-print">
          Los precios son ilustrativos. El checkout es una simulación: no se cobra nada ni se genera un pedido.
        </p>
        <button type="button" className="link-button" onClick={cartActions.clear}>
          Vaciar carrito
        </button>
      </aside>
    </div>
  );
}
