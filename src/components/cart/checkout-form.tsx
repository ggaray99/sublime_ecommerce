"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { placeOrderAction, type CheckoutState } from "@/app/checkout/actions";
import { Field } from "@/components/admin/forms";
import type { Product } from "@/data/products";
import { formatPrice } from "@/lib/format";
import { useCartLines, useCartSummary, useHydrated } from "./cart-store";

export type SavedAddress = {
  id: string;
  label: string;
  recipient: string;
  street: string;
  streetNumber: string;
  apartment: string;
  city: string;
  province: string;
  postalCode: string;
  notes: string;
};

type Props = {
  catalog: Product[];
  prefill: { name: string; email: string; phone: string };
  addresses: SavedAddress[];
  provinces: readonly string[];
  signedIn: boolean;
};

/** Real checkout (staging): reserves stock for 15 minutes; payment is arranged afterwards. */
export function CheckoutForm({ catalog, prefill, addresses, provinces, signedIn }: Props) {
  const hydrated = useHydrated();
  const lines = useCartLines();
  const { items, count, subtotal } = useCartSummary(catalog);
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrderAction, {});
  // One key per checkout page: a double click or a retry returns the same order.
  const [idempotencyKey] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`));
  const defaultAddress = addresses.find(Boolean);
  const [method, setMethod] = useState(state.values?.deliveryMethod ?? (defaultAddress ? "shipping" : "pickup"));
  const [addressId, setAddressId] = useState(defaultAddress?.id ?? "nueva");
  const ids = useId();

  if (!hydrated) return <p className="panel panel--muted">Cargando tu carrito…</p>;

  if (!items.length) {
    return (
      <div className="empty-state">
        <h2>Tu carrito está vacío.</h2>
        <p>Agregá productos para hacer un pedido.</p>
        <Link className="btn btn--acid" href="/tienda">
          Ir a la tienda
        </Link>
      </div>
    );
  }

  const address = addresses.find((candidate) => candidate.id === addressId);
  const value = (name: string, fallback = "") => state.values?.[name] ?? fallback;
  const issueFor = (productId: string, sku?: string) =>
    state.issues?.find((issue) => issue.productId === productId && (issue.sku ?? "") === (sku ?? ""))?.message ??
    state.issues?.find((issue) => issue.productId === productId && !issue.sku)?.message;

  return (
    <form action={action} className="cart-layout checkout-form" noValidate>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="cart" value={JSON.stringify(lines)} />

      <div className="checkout-form__fields">
        {state.error && (
          <p className="form-alert" role="alert">
            {state.error}
          </p>
        )}

        <fieldset className="admin-fieldset">
          <legend>Tus datos</legend>
          {!signedIn && (
            <p className="field__hint">
              ¿Tenés cuenta? <Link href="/cuenta/ingresar">Ingresá</Link> para ver el pedido en Mi cuenta y usar tus direcciones.
            </p>
          )}
          <div className="form-grid">
            <Field name="contactName" label="Nombre y apellido" state={state} defaultValue={value("contactName", prefill.name)} required />
            <Field name="contactEmail" label="Email" state={state} defaultValue={value("contactEmail", prefill.email)} required />
            <Field name="contactPhone" label="Teléfono" state={state} defaultValue={value("contactPhone", prefill.phone)} hint="Opcional, para coordinar." />
          </div>
        </fieldset>

        <fieldset className="admin-fieldset">
          <legend>Entrega</legend>
          <div className="delivery-choice">
            {[
              { value: "pickup", label: "Retiro en el taller", hint: "Coordinamos día y horario." },
              { value: "shipping", label: "Envío a domicilio", hint: "El costo se confirma después del pedido." },
            ].map((option) => (
              <label key={option.value} className="delivery-choice__option">
                <input type="radio" name="deliveryMethod" value={option.value} checked={method === option.value} onChange={() => setMethod(option.value)} />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </span>
              </label>
            ))}
          </div>

          {method === "shipping" && (
            <>
              {addresses.length > 0 && (
                <div className="field">
                  <label htmlFor={`${ids}-saved`}>Dirección</label>
                  <select id={`${ids}-saved`} value={addressId} onChange={(event) => setAddressId(event.target.value)}>
                    {addresses.map((saved) => (
                      <option key={saved.id} value={saved.id}>
                        {saved.label || "Dirección"} · {saved.street} {saved.streetNumber}, {saved.city}
                      </option>
                    ))}
                    <option value="nueva">Otra dirección</option>
                  </select>
                </div>
              )}
              {/* A new key re-fills the fields when another saved address is chosen. */}
              <div className="form-grid" key={addressId}>
                <Field name="recipient" label="Quién recibe" state={state} defaultValue={value("recipient", address?.recipient ?? prefill.name)} required />
                <Field name="street" label="Calle" state={state} defaultValue={value("street", address?.street)} required />
                <Field name="streetNumber" label="Altura" state={state} defaultValue={value("streetNumber", address?.streetNumber)} required />
                <Field name="apartment" label="Piso / depto" state={state} defaultValue={value("apartment", address?.apartment)} />
                <Field name="city" label="Localidad" state={state} defaultValue={value("city", address?.city)} required />
                <Field
                  name="province"
                  label="Provincia"
                  state={state}
                  defaultValue={value("province", address?.province ?? "")}
                  options={[{ value: "", label: "Elegí una provincia" }, ...provinces.map((province) => ({ value: province, label: province }))]}
                  required
                />
                <Field name="postalCode" label="Código postal" state={state} defaultValue={value("postalCode", address?.postalCode)} hint="CPA (M5500ABC) o 4 dígitos." required />
                <Field name="addressNotes" label="Indicaciones para la entrega" state={state} defaultValue={value("addressNotes", address?.notes)} />
              </div>
            </>
          )}
        </fieldset>

        <Field name="notes" label="Comentarios del pedido" state={state} defaultValue={value("notes")} hint="Opcional (hasta 500 caracteres)." multiline />
      </div>

      <aside className="summary" aria-labelledby="checkout-summary-title">
        <h2 id="checkout-summary-title">Tu pedido</h2>
        <ul className="summary__items">
          {items.map(({ product, variant, optionsLabel, quantity, lineTotal }) => {
            const issue = issueFor(product.id, variant?.sku);
            return (
              <li key={`${product.id}-${variant?.sku ?? ""}`}>
                <span>
                  {quantity} × {product.name}
                  {optionsLabel && ` (${optionsLabel})`}
                  {issue && <strong className="field__error"> · {issue}</strong>}
                </span>
                <span>{formatPrice(lineTotal)}</span>
              </li>
            );
          })}
        </ul>
        <dl>
          <div>
            <dt>Productos ({count})</dt>
            <dd>{formatPrice(subtotal)}</dd>
          </div>
          <div>
            <dt>Envío</dt>
            <dd>{method === "shipping" ? "A confirmar" : "Sin cargo (retiro)"}</dd>
          </div>
          <div className="summary__total">
            <dt>Total</dt>
            <dd>{formatPrice(subtotal)}</dd>
          </div>
        </dl>
        <button type="submit" className="btn btn--acid btn--block btn--lg" disabled={pending}>
          {pending ? "Confirmando…" : "Confirmar pedido"}
        </button>
        <p className="fine-print">
          Entorno de prueba: no se cobra nada online. Reservamos el stock por 15 minutos y después coordinamos el pago. El total se
          recalcula en el servidor con los precios vigentes.
        </p>
        {state.issues && (
          <Link className="link-button" href="/carrito">
            Revisar el carrito
          </Link>
        )}
      </aside>
    </form>
  );
}
