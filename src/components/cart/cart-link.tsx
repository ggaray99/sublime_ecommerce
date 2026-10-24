"use client";

import Link from "next/link";
import { useCartSummary } from "./cart-store";

export function CartLink() {
  const { count } = useCartSummary();
  return (
    <Link href="/carrito" className="cart-link" aria-label={`Carrito: ${count} ${count === 1 ? "artículo" : "artículos"}`}>
      <svg className="cart-link__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 8h14l-1.2 12H6.2L5 8Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M9 10V6.5a3 3 0 0 1 6 0V10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      <span className="cart-link__label" aria-hidden="true">
        Carrito
      </span>
      <span className="cart-link__count" aria-hidden="true">
        {count}
      </span>
    </Link>
  );
}
