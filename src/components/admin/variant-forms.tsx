"use client";

import { useActionState, useId } from "react";
import { configureOptionsAction, updateVariantAction } from "@/app/admin/actions";
import { Field, Status } from "./forms";

type OptionsInitial = { option1Name: string; option1Values: string; option2Name: string; option2Values: string };

/** Defines the options; saving creates the missing combinations and deactivates removed ones. */
export function OptionsForm({ productId, initial, hasOptions }: { productId: string; initial: OptionsInitial; hasOptions: boolean }) {
  const [state, action, pending] = useActionState(configureOptionsAction, {});
  const value = (key: keyof OptionsInitial) => state.values?.[key] ?? initial[key];
  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />
      {state.fields?.options && (
        <p className="form-alert" role="alert">
          {state.fields.options}
        </p>
      )}
      <input type="hidden" name="productId" value={productId} />
      <div className="form-grid">
        <Field name="option1Name" label="Opción 1" state={state} defaultValue={value("option1Name")} hint="Ej.: Talle" />
        <Field name="option1Values" label="Valores" state={state} defaultValue={value("option1Values")} hint="Separados por coma: S, M, L, XL" />
        <Field name="option2Name" label="Opción 2 (opcional)" state={state} defaultValue={value("option2Name")} hint="Ej.: Color" />
        <Field name="option2Values" label="Valores" state={state} defaultValue={value("option2Values")} hint="Ej.: Negro, Blanco" />
      </div>
      <p className="field__hint">
        Se crea una variante por combinación, con el precio actual y stock 0. Quitar un valor desactiva sus variantes (no se
        borran).
      </p>
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : hasOptions ? "Actualizar variantes" : "Crear variantes"}
      </button>
    </form>
  );
}

type VariantRowProps = { productId: string; variantId: string; label: string; price: string; active: boolean; priced: boolean };

/** Price and visibility of one combination, saved on its own. */
export function VariantRowForm({ productId, variantId, label, price, active, priced }: VariantRowProps) {
  const [state, action, pending] = useActionState(updateVariantAction, {});
  const id = useId();
  const isActive = state.values ? state.values.active === "on" : active;
  return (
    <form action={action} className="variant-row-form">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="variantId" value={variantId} />
      {priced ? (
        <Field name="price" label={`Precio ${label}`} state={state} defaultValue={state.values?.price ?? price} inputMode="decimal" />
      ) : (
        <input type="hidden" name="price" value="" />
      )}
      <div className="field field--check">
        <input id={id} name="active" type="checkbox" defaultChecked={isActive} />
        <label htmlFor={id}>
          Activa<span className="visually-hidden"> {label}</span>
        </label>
      </div>
      <button type="submit" className="link-button" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
        <span className="visually-hidden"> {label}</span>
      </button>
      {state.ok && (
        <span className="muted" role="status">
          {state.ok}
        </span>
      )}
      {state.error && (
        <span className="field__error" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
