"use client";

import { useActionState, useState } from "react";
import { savePromotionAction } from "@/app/admin/promociones/actions";
import { PROMOTION_KINDS, type PromotionKind } from "@/lib/promotions";
import type { AdminFormState } from "@/server/admin/guard";
import { Checkbox, Field, Status, type Option } from "./forms";

export type PromotionFormValues = {
  promotionId?: string;
  name: string;
  kind: PromotionKind;
  scope: string;
  categoryIds: string[];
  productIds: string;
  percent: string;
  amount: string;
  tierMin1: string;
  tierPercent1: string;
  tierMin2: string;
  tierPercent2: string;
  tierMin3: string;
  tierPercent3: string;
  buy: string;
  pay: string;
  bundleProduct1: string;
  bundleQuantity1: string;
  bundleProduct2: string;
  bundleQuantity2: string;
  bundleProduct3: string;
  bundleQuantity3: string;
  bundlePrice: string;
  couponCode: string;
  minSubtotal: string;
  startsAt: string;
  endsAt: string;
  maxUses: string;
  active: boolean;
};

type TextKey = Exclude<keyof PromotionFormValues, "promotionId" | "active" | "categoryIds" | "kind">;

const KIND_HELP: Record<PromotionKind, string> = {
  percent: "Un porcentaje sobre los productos elegidos.",
  fixed: "Un monto que se descuenta del total (sin pasar de lo que suman los productos elegidos).",
  quantity_tiers: "Más unidades, más descuento. Se cuentan todas las unidades de los productos elegidos.",
  buy_x_pay_y: "Por cada grupo (por ejemplo 3), se paga solo una parte (2): las unidades más baratas salen gratis.",
  free_shipping: "El envío a domicilio sale gratis. Combinalo con un mínimo de compra.",
  bundle: "Un precio especial cuando el carrito tiene todos los productos del combo.",
  payment_method: "Descuento al elegir transferencia o efectivo en el checkout. Se aplica al final, sobre lo que queda.",
};

export function PromotionForm({ initial, categories }: { initial: PromotionFormValues; categories: Option[] }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(savePromotionAction, {});
  const value = (key: TextKey) => state.values?.[key] ?? initial[key];
  const [kind, setKind] = useState<PromotionKind>((state.values?.kind as PromotionKind) ?? initial.kind);
  const [scope, setScope] = useState(state.values?.scope ?? initial.scope);
  const chosen = new Set(state.values?.categoryIds?.split(",") ?? initial.categoryIds);
  const scoped = kind !== "bundle" && kind !== "free_shipping" && kind !== "payment_method";

  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />
      {initial.promotionId && <input type="hidden" name="promotionId" value={initial.promotionId} />}
      <div className="form-grid">
        <Field name="name" label="Nombre" state={state} defaultValue={value("name")} hint="Lo ve el cliente en el carrito. Ej.: 3x2 en stickers" required />
        <div className="field">
          <label htmlFor="promo-kind">Tipo</label>
          <select id="promo-kind" name="kind" value={kind} onChange={(event) => setKind(event.currentTarget.value as PromotionKind)}>
            {Object.entries(PROMOTION_KINDS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {state.fields?.kind && <p className="field__error">{state.fields.kind}</p>}
        </div>
      </div>
      <p className="muted">{KIND_HELP[kind]}</p>

      <fieldset className="admin-fieldset">
        <legend>Descuento</legend>
        <div className="form-grid">
          {(kind === "percent" || kind === "payment_method") && (
            <Field name="percent" label="Porcentaje" state={state} defaultValue={value("percent")} inputMode="numeric" hint="Ej.: 10" required />
          )}
          {kind === "fixed" && <Field name="amount" label="Monto (ARS)" state={state} defaultValue={value("amount")} inputMode="decimal" hint="Ej.: 2.000" required />}
          {kind === "quantity_tiers" &&
            [1, 2, 3].map((row) => (
              <div key={row} className="promo-pair">
                <Field name={`tierMin${row}`} label={`Desde (unidades) · escala ${row}`} state={state} defaultValue={value(`tierMin${row}` as TextKey)} inputMode="numeric" hint={row === 1 ? "Ej.: 4" : "Opcional"} />
                <Field name={`tierPercent${row}`} label="Descuento (%)" state={state} defaultValue={value(`tierPercent${row}` as TextKey)} inputMode="numeric" hint={row === 1 ? "Ej.: 10" : ""} />
              </div>
            ))}
          {kind === "buy_x_pay_y" && (
            <>
              <Field name="buy" label="Llevá" state={state} defaultValue={value("buy")} inputMode="numeric" hint="Ej.: 3" required />
              <Field name="pay" label="Pagá" state={state} defaultValue={value("pay")} inputMode="numeric" hint="Ej.: 2" required />
            </>
          )}
          {kind === "bundle" && (
            <>
              {[1, 2, 3].map((row) => (
                <div key={row} className="promo-pair">
                  <Field
                    name={`bundleProduct${row}`}
                    label={`Producto ${row}`}
                    state={state}
                    defaultValue={value(`bundleProduct${row}` as TextKey)}
                    hint={row === 3 ? "Opcional" : "Código, ej.: taza-kiss"}
                  />
                  <Field name={`bundleQuantity${row}`} label="Cantidad" state={state} defaultValue={value(`bundleQuantity${row}` as TextKey)} inputMode="numeric" hint="1" />
                </div>
              ))}
              <Field name="bundlePrice" label="Precio del combo (ARS)" state={state} defaultValue={value("bundlePrice")} inputMode="decimal" hint="Ej.: 20.000" required />
            </>
          )}
          {kind === "free_shipping" && <p className="muted">Sin valores: el envío queda en $0.</p>}
        </div>
        {kind === "bundle" && <p className="muted">El código de cada producto está en su ficha (Productos → la dirección /producto/…).</p>}
      </fieldset>

      {scoped && (
        <fieldset className="admin-fieldset">
          <legend>Se aplica a</legend>
          <div className="delivery-choice">
            {[
              { value: "all", label: "Toda la tienda" },
              { value: "categories", label: "Algunas categorías" },
              { value: "products", label: "Algunos productos" },
            ].map((option) => (
              <label key={option.value} className="delivery-choice__option">
                <input type="radio" name="scope" value={option.value} checked={scope === option.value} onChange={() => setScope(option.value)} />
                <span>
                  <strong>{option.label}</strong>
                </span>
              </label>
            ))}
          </div>
          {state.fields?.scope && <p className="field__error">{state.fields.scope}</p>}
          {scope === "categories" && (
            <div className="promo-categories">
              {categories.map((category) => (
                <label key={category.value} className="field--check">
                  <input type="checkbox" name="categoryIds" value={category.value} defaultChecked={chosen.has(category.value)} /> {category.label}
                </label>
              ))}
            </div>
          )}
          {scope === "products" && (
            <Field name="productIds" label="Códigos de producto" state={state} defaultValue={value("productIds")} hint="Separados por coma. Ej.: taza-kiss, remera-pop" />
          )}
        </fieldset>
      )}
      {!scoped && <input type="hidden" name="scope" value="all" />}

      <fieldset className="admin-fieldset">
        <legend>Condiciones</legend>
        <div className="form-grid">
          {kind !== "payment_method" && (
            <Field name="couponCode" label="Cupón" state={state} defaultValue={value("couponCode")} hint="Vacío = automática. Ej.: VERANO10" />
          )}
          <Field name="minSubtotal" label="Compra mínima (ARS)" state={state} defaultValue={value("minSubtotal")} inputMode="decimal" hint="Opcional" />
          <Field name="maxUses" label="Usos máximos" state={state} defaultValue={value("maxUses")} inputMode="numeric" hint="Vacío = ilimitado" />
          <div className="field">
            <label htmlFor="promo-start">Empieza</label>
            <input id="promo-start" name="startsAt" type="datetime-local" defaultValue={value("startsAt")} />
            {state.fields?.startsAt && <p className="field__error">{state.fields.startsAt}</p>}
          </div>
          <div className="field">
            <label htmlFor="promo-end">Termina</label>
            <input id="promo-end" name="endsAt" type="datetime-local" defaultValue={value("endsAt")} />
            {state.fields?.endsAt && <p className="field__error">{state.fields.endsAt}</p>}
          </div>
        </div>
        <p className="muted">Hora de Argentina. Sin fechas, rige mientras esté activa.</p>
      </fieldset>

      <Checkbox name="active" label="Activa" defaultChecked={state.values ? state.values.active === "on" : initial.active} />
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : initial.promotionId ? "Guardar cambios" : "Crear promoción"}
      </button>
    </form>
  );
}
