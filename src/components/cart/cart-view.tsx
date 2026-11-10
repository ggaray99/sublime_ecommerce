"use client";

import type { Product } from "@/data/products";
import Image from "next/image";
import Link from "next/link";
import { MAX_QUANTITY } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import { categoryLabelOf } from "@/lib/catalog";
import { cartActions, useCartSummary, useHydrated } from "./cart-store";
import { QuantityStepper } from "./quantity-stepper";

/** `realCheckout`: orders are enabled (staging) and the checkout places a real order. */
export function CartView({ catalog, realCheckout = false }: { catalog: Product[]; realCheckout?: boolean }) {
  const hydrated = useHydrated();
  const { items, count, subtotal } = useCartSummary(catalog);

  if (!hydrated) {
    return <p className="panel panel--muted">Cargando tu carrito…</p>;
  }

  if (!items.length) {
    return (
      <div className="empty-state">
        <h2>Tu carrito está vacío.</h2>
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
          {items.map(({ product, variant, optionsLabel, quantity, unitPrice, stock, lineTotal }) => (
            <li key={`${product.id}-${variant?.sku ?? ""}`} className="cart-item">
              <Link href={`/producto/${product.slug}`} className="cart-item__image" tabIndex={-1} aria-hidden="true">
                <Image src={product.images[0].src} alt="" width={160} height={160} />
              </Link>
              <div className="cart-item__info">
                <p className="kicker">{categoryLabelOf(product)}</p>
                <h3>
                  <Link href={`/producto/${product.slug}`}>{product.name}</Link>
                </h3>
                {optionsLabel && <p className="cart-item__options">{optionsLabel}</p>}
                <p className="muted">{formatPrice(unitPrice)} c/u</p>
                {stock !== undefined && stock !== null && quantity > stock && (
                  <p className="field__error">{stock === 0 ? "Sin stock por ahora." : `Solo quedan ${stock} unidades.`}</p>
                )}
              </div>
              <div className="cart-item__controls">
                <QuantityStepper
                  label={`Cantidad de ${product.name}${optionsLabel ? ` (${optionsLabel})` : ""}`}
                  value={quantity}
                  min={1}
                  max={MAX_QUANTITY}
                  onChange={(next) => cartActions.setQuantity(product.id, next, variant?.sku)}
                />
                <button type="button" className="link-button" onClick={() => cartActions.remove(product.id, variant?.sku)}>
                  Quitar
                  <span className="visually-hidden">
                    {" "}
                    {product.name} {optionsLabel}
                  </span>
                </button>
              </div>
              <p className="cart-item__total">{formatPrice(lineTotal)}</p>
            </li>
          ))}
        </ul>
      </section>

      <aside className="summary" aria-labelledby="cart-summary-title">
        <h2 id="cart-summary-title">Resumen</h2>
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
            <dt>Total</dt>
            <dd>{formatPrice(subtotal)}</dd>
          </div>
        </dl>
        <Link className="btn btn--acid btn--block btn--lg" href="/checkout">
          Ir al checkout
        </Link>
        <p className="fine-print">
          {realCheckout ? "Al confirmar reservamos el stock por 15 minutos. En el checkout elegís cómo pagar." : "Las compras online todavía no están habilitadas: el checkout es una simulación y no genera un pedido."}
        </p>
        <button type="button" className="link-button" onClick={cartActions.clear}>
          Vaciar carrito
        </button>
      </aside>
    </div>
  );
}
