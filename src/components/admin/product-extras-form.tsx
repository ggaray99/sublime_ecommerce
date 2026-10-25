"use client";

import { useActionState, useState } from "react";
import { updateProductExtrasAction } from "@/app/admin/actions";
import { formatPrice } from "@/lib/format";
import type { AdminFormState } from "@/server/admin/guard";
import { Field, Status } from "./forms";

export type ExtrasFormValues = {
  weightG: string;
  length: string;
  width: string;
  height: string;
  cost: string;
  lowStockThreshold: string;
  saleKind: "none" | "percent" | "price";
  salePercent: string;
  salePrice: string;
  saleStartsAt: string;
  saleEndsAt: string;
};

/** "2.500,50" → 2500.5 for the margin preview (the server parses it again). */
const pesos = (text: string) => {
  const compact = text.replace(/\s|\$/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(compact);
  return compact && Number.isFinite(value) ? value : null;
};

export function ProductExtrasForm({
  productId,
  initial,
  priceMinor,
  hasOptions,
}: {
  productId: string;
  initial: ExtrasFormValues;
  /** Regular price of the default variant, for the margin. */
  priceMinor: number | null;
  hasOptions: boolean;
}) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(updateProductExtrasAction, {});
  const value = (key: keyof ExtrasFormValues) => state.values?.[key] ?? initial[key];
  const [saleKind, setSaleKind] = useState(value("saleKind"));
  const [cost, setCost] = useState(value("cost"));
  const [salePercent, setSalePercent] = useState(value("salePercent"));
  const [salePrice, setSalePrice] = useState(value("salePrice"));

  const price = priceMinor === null ? null : priceMinor / 100;
  const salePriceValue =
    price === null ? null : saleKind === "percent" ? Math.round((price * (100 - (Number(salePercent) || 0))) / 100) : saleKind === "price" ? pesos(salePrice) : null;
  const costValue = pesos(cost);
  const margin = (sell: number | null) => (sell && costValue !== null ? Math.round(((sell - costValue) / sell) * 100) : null);

  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />
      <input type="hidden" name="productId" value={productId} />

      <fieldset className="admin-fieldset">
        <legend>Costo y margen</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="extras-cost">Costo por unidad (ARS)</label>
            <input id="extras-cost" name="cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.currentTarget.value)} placeholder="Ej.: 1.700" />
            {state.fields?.cost && <p className="field__error">{state.fields.cost}</p>}
          </div>
          <div className="field">
            <span className="field__label">Margen</span>
            <p className="extras-margin" aria-live="polite">
              {price === null
                ? "Se cotiza a pedido."
                : costValue === null
                  ? "Cargá el costo para ver el margen."
                  : `${margin(price)} % a ${formatPrice(price)}${salePriceValue !== null && salePriceValue !== price ? ` · ${margin(salePriceValue)} % en oferta (${formatPrice(salePriceValue)})` : ""}`}
            </p>
            {costValue !== null && salePriceValue !== null && salePriceValue < costValue && (
              <p className="field__error">La oferta queda por debajo del costo.</p>
            )}
          </div>
        </div>
        {hasOptions && <p className="muted">Con variantes, este costo es el de la variante principal. El de cada talle o color se carga con la importación.</p>}
      </fieldset>

      <fieldset className="admin-fieldset">
        <legend>Oferta</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="extras-sale-kind">Tipo</label>
            <select id="extras-sale-kind" name="saleKind" value={saleKind} onChange={(e) => setSaleKind(e.currentTarget.value as ExtrasFormValues["saleKind"])}>
              <option value="none">Sin oferta</option>
              <option value="percent">Porcentaje de descuento</option>
              {!hasOptions && <option value="price">Precio fijo de oferta</option>}
            </select>
          </div>
          {saleKind === "percent" && (
            <div className="field">
              <label htmlFor="extras-sale-percent">Descuento (%)</label>
              <input id="extras-sale-percent" name="salePercent" inputMode="numeric" value={salePercent} onChange={(e) => setSalePercent(e.currentTarget.value)} placeholder="Ej.: 15" />
              {state.fields?.salePercent && <p className="field__error">{state.fields.salePercent}</p>}
            </div>
          )}
          {saleKind === "price" && (
            <div className="field">
              <label htmlFor="extras-sale-price">Precio de oferta (ARS)</label>
              <input id="extras-sale-price" name="salePrice" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.currentTarget.value)} placeholder="Ej.: 1.500" />
              {state.fields?.salePrice && <p className="field__error">{state.fields.salePrice}</p>}
            </div>
          )}
          {saleKind !== "none" && (
            <>
              <div className="field">
                <label htmlFor="extras-sale-start">Empieza (opcional)</label>
                <input id="extras-sale-start" name="saleStartsAt" type="datetime-local" defaultValue={value("saleStartsAt")} />
                {state.fields?.saleStartsAt && <p className="field__error">{state.fields.saleStartsAt}</p>}
              </div>
              <div className="field">
                <label htmlFor="extras-sale-end">Termina (opcional)</label>
                <input id="extras-sale-end" name="saleEndsAt" type="datetime-local" defaultValue={value("saleEndsAt")} />
                {state.fields?.saleEndsAt && <p className="field__error">{state.fields.saleEndsAt}</p>}
              </div>
            </>
          )}
        </div>
        {saleKind !== "none" && <p className="muted">Hora de Argentina. La tienda muestra el precio anterior tachado y la etiqueta “Oferta”.</p>}
      </fieldset>

      <fieldset className="admin-fieldset">
        <legend>Envío y stock</legend>
        <div className="form-grid">
          <Field name="weightG" label="Peso con empaque (g)" state={state} defaultValue={value("weightG")} inputMode="numeric" hint="Ej.: 180" />
          <Field name="lowStockThreshold" label="Avisar con stock en" state={state} defaultValue={value("lowStockThreshold")} inputMode="numeric" hint="Unidades. Vacío = el general (5)" />
          <Field name="length" label="Largo (cm)" state={state} defaultValue={value("length")} inputMode="decimal" hint="Paquete armado" />
          <Field name="width" label="Ancho (cm)" state={state} defaultValue={value("width")} inputMode="decimal" />
          <Field name="height" label="Alto (cm)" state={state} defaultValue={value("height")} inputMode="decimal" />
        </div>
      </fieldset>

      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : "Guardar venta y logística"}
      </button>
    </form>
  );
}
