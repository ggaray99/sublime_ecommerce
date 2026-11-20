"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useState, useTransition } from "react";
import { placeOrderAction, previewDiscountAction, type CheckoutState, type DiscountPreview } from "@/app/checkout/actions";
import { Field } from "@/components/form-field";
import type { Product } from "@/data/products";
import { lineKey, type CartDesign } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import { etaLabel, quoteShipping, type PickupSettings, type ShippingRule } from "@/server/shipping/rules";
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
  /** Published designs, to show design lines by their name. */
  designs?: CartDesign[];
  prefill: { name: string; email: string; phone: string };
  addresses: SavedAddress[];
  provinces: readonly string[];
  signedIn: boolean;
  /** Active rules, to show an estimate while typing; the server quotes again when placing the order. */
  shippingRules: ShippingRule[];
  pickup: PickupSettings;
  /** Mercado Pago is set up: the non-transfer choice pays online from the order page. */
  onlinePayment: boolean;
};

/** Real checkout (staging): reserves stock for 15 minutes; then Mercado Pago, or a transfer arranged with the shop. */
export function CheckoutForm({ catalog, designs = [], prefill, addresses, provinces, signedIn, shippingRules, pickup, onlinePayment }: Props) {
  const hydrated = useHydrated();
  const lines = useCartLines();
  const { items, count, subtotal } = useCartSummary(catalog, designs);
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrderAction, {});
  // One key per checkout page: a double click or a retry returns the same order.
  const [idempotencyKey] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`));
  const defaultAddress = addresses.find(Boolean);
  const [method, setMethod] = useState(state.values?.deliveryMethod ?? (defaultAddress || !pickup.enabled ? "shipping" : "pickup"));
  const [addressId, setAddressId] = useState(defaultAddress?.id ?? "nueva");
  // Where the estimate comes from: follows what is typed in province, city and postal code.
  const [typed, setTyped] = useState<{ province?: string; city?: string; postalCode?: string }>({});
  const ids = useId();
  // Coupon and payment choice: the server previews the discount (and applies it again on confirm).
  const [couponDraft, setCouponDraft] = useState(state.values?.couponCode ?? "");
  const [coupon, setCoupon] = useState(state.values?.couponCode ?? "");
  const [payment, setPayment] = useState<"any" | "transfer">(state.values?.paymentPreference === "transfer" ? "transfer" : "any");
  const [preview, setPreview] = useState<DiscountPreview | null>(null);
  const [checking, startChecking] = useTransition();
  const cartJson = JSON.stringify(lines);
  useEffect(() => {
    if (!lines.length) return;
    startChecking(async () => {
      setPreview(await previewDiscountAction({ cart: cartJson, couponCode: coupon, paymentPreference: payment }).catch(() => null));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cartJson stands for the lines
  }, [cartJson, coupon, payment]);

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

  const value = (name: string, fallback = "") => state.values?.[name] ?? fallback;
  const address = addresses.find((candidate) => candidate.id === addressId);
  const destination = {
    province: typed.province ?? value("province", address?.province ?? ""),
    city: typed.city ?? value("city", address?.city ?? ""),
    postalCode: typed.postalCode ?? value("postalCode", address?.postalCode ?? ""),
  };
  const subtotalMinor = Math.round(subtotal * 100);
  const discountMinor = preview?.discountMinor ?? 0;
  const freeShipping = preview?.freeShipping ?? false;
  const estimate =
    method === "shipping" && destination.province && destination.postalCode
      ? quoteShipping(shippingRules, destination, subtotalMinor - discountMinor)
      : null;
  const shippingMinor = method === "pickup" || freeShipping ? 0 : estimate?.covered ? estimate.costMinor : null;
  const couponState = coupon && preview?.coupon?.code === coupon.toUpperCase().replace(/\s+/g, "") ? preview.coupon : null;
  const issueFor = (productId: string, sku?: string, designId?: string) => {
    const sameDesign = (issue: { designId?: string }) => (issue.designId ?? "") === (designId ?? "");
    return (
      state.issues?.find((issue) => issue.productId === productId && (issue.sku ?? "") === (sku ?? "") && sameDesign(issue))?.message ??
      state.issues?.find((issue) => issue.productId === productId && !issue.sku && sameDesign(issue))?.message
    );
  };

  return (
    <form
      action={action}
      className="cart-layout checkout-form"
      noValidate
      onChange={(event) => {
        const field = event.target as unknown as HTMLInputElement;
        if (["province", "city", "postalCode"].includes(field.name)) setTyped((current) => ({ ...current, [field.name]: field.value }));
      }}
    >
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="cart" value={cartJson} />
      <input type="hidden" name="couponCode" value={couponState?.applied ? coupon : ""} />

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
            <Field name="contactPhone" label="Teléfono" state={state} defaultValue={value("contactPhone", prefill.phone)} hint="Con código de área. Ej.: 261 555-1234" required />
          </div>
        </fieldset>

        <fieldset className="admin-fieldset">
          <legend>Entrega</legend>
          <div className="delivery-choice">
            {[
              ...(pickup.enabled
                ? [{ value: "pickup", label: "Retiro en el taller (sin cargo)", hint: [pickup.address, pickup.hours].filter(Boolean).join(" · ") || "Coordinamos día y horario." }]
                : []),
              { value: "shipping", label: "Envío a domicilio", hint: "El costo depende de la zona y se calcula al completar la dirección." },
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

        <fieldset className="admin-fieldset">
          <legend>Pago</legend>
          <div className="delivery-choice">
            {[
              onlinePayment
                ? { value: "any" as const, label: "Mercado Pago", hint: "Tarjeta, dinero en cuenta o Mercado Crédito. Pagás al confirmar el pedido." }
                : { value: "any" as const, label: "Lo coordinamos después", hint: "Te escribimos con los medios disponibles." },
              {
                value: "transfer" as const,
                label: preview?.transferPercent ? `Transferencia o efectivo (−${preview.transferPercent} %)` : "Transferencia o efectivo",
                hint: preview?.transferPercent ? "El descuento ya se ve en el total." : "Te pasamos los datos al confirmar.",
              },
            ].map((option) => (
              <label key={option.value} className="delivery-choice__option">
                <input type="radio" name="paymentPreference" value={option.value} checked={payment === option.value} onChange={() => setPayment(option.value)} />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="field">
            <label htmlFor={`${ids}-coupon`}>Cupón de descuento</label>
            <div className="coupon-row">
              <input
                id={`${ids}-coupon`}
                value={couponDraft}
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="Ej.: VERANO10"
                onChange={(event) => setCouponDraft(event.target.value)}
                onKeyDown={(event) => {
                  // Enter applies the coupon instead of submitting the order.
                  if (event.key === "Enter") {
                    event.preventDefault();
                    setCoupon(couponDraft.trim());
                  }
                }}
              />
              {coupon && couponState?.applied ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setCoupon("");
                    setCouponDraft("");
                  }}
                >
                  Quitar
                </button>
              ) : (
                <button type="button" className="btn btn--coal" disabled={!couponDraft.trim() || checking} onClick={() => setCoupon(couponDraft.trim())}>
                  Aplicar
                </button>
              )}
            </div>
            {(couponState || state.fields?.couponCode) && (
              <p className={couponState?.applied ? "field__hint" : "field__error"} aria-live="polite">
                {couponState?.message ?? state.fields?.couponCode}
              </p>
            )}
          </div>
        </fieldset>

        <Field name="notes" label="Comentarios del pedido" state={state} defaultValue={value("notes")} hint="Opcional (hasta 500 caracteres)." multiline />
      </div>

      <aside className="summary" aria-labelledby="checkout-summary-title">
        <h2 id="checkout-summary-title">Tu pedido</h2>
        <ul className="summary__items">
          {items.map(({ product, design, variant, optionsLabel, quantity, lineTotal }) => {
            const issue = issueFor(product.id, variant?.sku, design?.id);
            return (
              <li key={lineKey(product.id, variant?.sku, design?.id)}>
                <span>
                  {quantity} × {design?.name ?? product.name}
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
          {preview?.lines
            .filter((line) => line.amountMinor > 0)
            .map((line) => (
              <div key={line.name} className="summary__discount">
                <dt>{line.name}</dt>
                <dd>−{formatPrice(line.amountMinor / 100)}</dd>
              </div>
            ))}
          <div>
            <dt>Envío</dt>
            <dd>
              {method === "pickup"
                ? "Sin cargo (retiro)"
                : freeShipping
                  ? "Gratis (promoción)"
                : !estimate
                  ? "Completá la dirección"
                  : estimate.covered
                    ? estimate.free
                      ? "Gratis"
                      : formatPrice(estimate.costMinor / 100)
                    : "Sin cobertura"}
            </dd>
          </div>
          <div className="summary__total">
            <dt>Total</dt>
            <dd>{formatPrice((subtotalMinor - discountMinor + (shippingMinor ?? 0)) / 100)}</dd>
          </div>
        </dl>
        {estimate?.covered && (
          <p className="fine-print" aria-live="polite">
            {estimate.label}: llega en {etaLabel(estimate.etaMinDays, estimate.etaMaxDays)} desde que se despacha.
            {!estimate.free && estimate.covered && shippingRules.find((rule) => rule.id === estimate.ruleId)?.freeFromMinor
              ? ` Envío gratis desde ${formatPrice((shippingRules.find((rule) => rule.id === estimate.ruleId)!.freeFromMinor ?? 0) / 100)}.`
              : ""}
          </p>
        )}
        {estimate && !estimate.covered && (
          <p className="form-alert" role="alert">
            {estimate.reason}
          </p>
        )}
        <button type="submit" className="btn btn--acid btn--block btn--lg" disabled={pending}>
          {pending ? "Confirmando…" : "Confirmar pedido"}
        </button>
        <p className="fine-print">
          {onlinePayment && payment === "any"
            ? "Al confirmar reservamos el stock por 15 minutos y te mostramos el botón para pagar con Mercado Pago."
            : payment === "transfer"
              ? "Al confirmar reservamos el stock por 15 minutos y te escribimos con los datos para la transferencia."
              : "Al confirmar reservamos el stock por 15 minutos y te escribimos para coordinar el pago."}{" "}
          Precios, descuentos y envío se recalculan al confirmar.
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
