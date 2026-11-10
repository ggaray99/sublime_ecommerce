"use client";

import { useState } from "react";
import { MAX_QUANTITY } from "@/lib/cart";
import { cartActions } from "./cart-store";
import { showToast } from "./toast-store";
import { QuantityStepper } from "./quantity-stepper";

type Props = { productId: string; productName: string };

function add(productId: string, productName: string, quantity: number) {
  cartActions.add(productId, quantity);
  showToast(`${quantity > 1 ? `${quantity} × ` : ""}${productName} se sumó al carrito.`);
}

/** Compact button used on product cards. */
export function AddToCartButton({ productId, productName }: Props) {
  return (
    <button
      type="button"
      className="btn btn--acid btn--block"
      onClick={() => add(productId, productName, 1)}
      aria-label={`Agregar ${productName} al carrito`}
    >
      Agregar al carrito
    </button>
  );
}

/** Quantity selector + add button for the product detail page. */
export function AddToCartPanel({ productId, productName }: Props) {
  const [quantity, setQuantity] = useState(1);
  return (
    <div className="purchase">
      <QuantityStepper
        label={`Cantidad de ${productName}`}
        value={quantity}
        min={1}
        max={MAX_QUANTITY}
        onChange={setQuantity}
      />
      <button type="button" className="btn btn--acid btn--lg" onClick={() => add(productId, productName, quantity)}>
        Agregar al carrito
      </button>
    </div>
  );
}
