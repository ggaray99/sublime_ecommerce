"use client";

import type { Product } from "@/data/products";
import Link from "next/link";
import { useRef, useState } from "react";
import { formatPrice } from "@/lib/format";
import { cartActions, useCartSummary, useHydrated } from "./cart-store";

const steps = [
  { title: "Datos de contacto", body: "Nombre, email y teléfono. En esta demo no se piden datos." },
  { title: "Envío o retiro", body: "Cobertura, costos y plazos todavía no están definidos." },
  { title: "Pago", body: "No hay medios de pago integrados. Ningún dato de tarjeta se solicita ni se procesa." },
];

export function CheckoutDemo({ catalog }: { catalog: Product[] }) {
  const hydrated = useHydrated();
  const { items, count, subtotal } = useCartSummary(catalog);
  const [result, setResult] = useState<{ count: number; subtotal: number } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  if (!hydrated) return <p className="panel panel--muted">Cargando el resumen…</p>;

  if (result) {
    return (
      <div className="panel panel--result" ref={resultRef} tabIndex={-1}>
        <p className="kicker">Simulación terminada</p>
        <h2>No se realizó ninguna compra.</h2>
        <p>
          Recorriste el flujo de prueba con {result.count} {result.count === 1 ? "artículo" : "artículos"} por un total
          ilustrativo de {formatPrice(result.subtotal)}. No se cobró dinero, no se generó un pedido y no se envió información a ningún negocio.
        </p>
        <div className="actions">
          {count > 0 && (
            <button type="button" className="btn btn--acid" onClick={cartActions.clear}>
              Vaciar carrito demo
            </button>
          )}
          <Link className="btn btn--ghost" href="/tienda">
            Volver a la tienda
          </Link>
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="empty-state">
        <h2>No hay artículos para simular.</h2>
        <p>Agregá productos al carrito demo para recorrer el checkout de prueba.</p>
        <Link className="btn btn--acid" href="/tienda">
          Ir a la tienda
        </Link>
      </div>
    );
  }

  return (
    <div className="cart-layout">
      <ol className="checkout-steps">
        {steps.map((step, index) => (
          <li key={step.title}>
            <span className="checkout-steps__number">0{index + 1}</span>
            <div>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
              <span className="badge badge--pending">No disponible en la demo</span>
            </div>
          </li>
        ))}
      </ol>

      <aside className="summary" aria-labelledby="checkout-summary-title">
        <h2 id="checkout-summary-title">Tu selección</h2>
        <ul className="summary__items">
          {items.map(({ product, variant, optionsLabel, quantity, lineTotal }) => (
            <li key={`${product.id}-${variant?.sku ?? ""}`}>
              <span>
                {quantity} × {product.name}
                {optionsLabel && ` (${optionsLabel})`}
              </span>
              <span>{formatPrice(lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl>
          <div className="summary__total">
            <dt>Total demo</dt>
            <dd>{formatPrice(subtotal)}</dd>
          </div>
        </dl>
        <button
          type="button"
          className="btn btn--acid btn--block btn--lg"
          onClick={() => {
            setResult({ count, subtotal });
            requestAnimationFrame(() => resultRef.current?.focus());
          }}
        >
          Simular finalización
        </button>
        <p className="fine-print">Este botón no confirma ninguna compra: solo muestra el final del recorrido de prueba.</p>
        <Link className="link-button" href="/carrito">
          ← Volver al carrito
        </Link>
      </aside>
    </div>
  );
}
