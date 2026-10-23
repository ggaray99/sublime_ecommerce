"use client";

import { useId, useState } from "react";
import type { ProductVariant } from "@/data/products";
import { MAX_QUANTITY } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import { cartActions } from "./cart-store";
import { QuantityStepper } from "./quantity-stepper";
import { showToast } from "./toast-store";

type Props = { productId: string; productName: string; optionNames: string[]; variants: ProductVariant[] };

const inStock = (variant: ProductVariant) => variant.stock === null || variant.stock > 0;
const matches = (variant: ProductVariant, selection: Record<string, string>) =>
  Object.entries(selection).every(([name, value]) => variant.options[name] === value);

/** Option pickers (talle, color…) for products with variants; each combination has its own price and stock. */
export function VariantPurchase({ productId, productName, optionNames, variants }: Props) {
  const id = useId();
  // Start on the first combination that can be bought.
  const initial = variants.find(inStock) ?? variants[0];
  const [selection, setSelection] = useState<Record<string, string>>(() => ({ ...initial.options }));
  const [quantity, setQuantity] = useState(1);

  const variant = variants.find((candidate) => matches(candidate, selection) && Object.keys(candidate.options).length === optionNames.length);
  const values = (name: string) => [...new Set(variants.map((candidate) => candidate.options[name]).filter(Boolean))];
  /** A value is available if some variant with it (and the other current choices) has stock. */
  const available = (name: string, value: string) =>
    variants.some((candidate) => candidate.options[name] === value && inStock(candidate) && matches(candidate, { ...selection, [name]: value }));

  const choose = (name: string, value: string) => {
    const next = { ...selection, [name]: value };
    // If that combination does not exist, keep the new value and take the first variant that has it.
    if (!variants.some((candidate) => matches(candidate, next))) {
      const fallback = variants.find((candidate) => candidate.options[name] === value && inStock(candidate)) ?? variants.find((candidate) => candidate.options[name] === value);
      setSelection(fallback ? { ...fallback.options } : next);
    } else {
      setSelection(next);
    }
  };

  const label = optionNames.map((name) => `${name} ${selection[name]}`).join(" · ");
  const canBuy = Boolean(variant && variant.price !== null && inStock(variant));
  const maxQuantity = variant?.stock ? Math.min(MAX_QUANTITY, variant.stock) : MAX_QUANTITY;

  return (
    <div className="variant-purchase">
      {optionNames.map((name) => (
        <fieldset key={name} className="variant-options">
          <legend>
            {name}: <strong>{selection[name]}</strong>
          </legend>
          <div className="variant-options__values">
            {values(name).map((value) => {
              const inputId = `${id}-${name}-${value}`;
              const disabledLook = !available(name, value);
              return (
                <span key={value} className="variant-option">
                  <input
                    id={inputId}
                    type="radio"
                    name={`${id}-${name}`}
                    value={value}
                    checked={selection[name] === value}
                    onChange={() => choose(name, value)}
                  />
                  <label htmlFor={inputId} className={disabledLook ? "is-unavailable" : undefined}>
                    {value}
                    {disabledLook && <span className="visually-hidden"> (sin stock)</span>}
                  </label>
                </span>
              );
            })}
          </div>
        </fieldset>
      ))}

      <p className="product-detail__price" aria-live="polite">
        {variant?.price != null ? formatPrice(variant.price) : "—"}
        <span className="badge badge--violet">Precio demo</span>
      </p>
      <p className={`stock-note ${variant && inStock(variant) ? "stock-note--in" : "stock-note--out"}`} aria-live="polite">
        {!variant
          ? "Esa combinación no está disponible."
          : variant.stock === null
            ? "Se fabrica a pedido."
            : variant.stock > 0
              ? `Stock disponible: ${variant.stock} ${variant.stock === 1 ? "unidad" : "unidades"}`
              : "Sin stock en esta opción."}
      </p>

      {canBuy && variant && (
        <div className="purchase">
          <QuantityStepper
            label={`Cantidad de ${productName} (${label})`}
            value={Math.min(quantity, maxQuantity)}
            min={1}
            max={maxQuantity}
            onChange={setQuantity}
          />
          <button
            type="button"
            className="btn btn--acid btn--lg"
            onClick={() => {
              const amount = Math.min(quantity, maxQuantity);
              cartActions.add(productId, amount, variant.sku);
              showToast(`${amount > 1 ? `${amount} × ` : ""}${productName} (${label}) se sumó al carrito demo.`);
            }}
          >
            Agregar al carrito demo
          </button>
        </div>
      )}
    </div>
  );
}
