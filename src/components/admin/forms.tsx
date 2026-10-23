"use client";

import { useActionState, useId } from "react";
import { countStockAction, updateProductAction, type AdminFormState } from "@/app/admin/actions";

type Option = { value: string; label: string };

type FieldProps = {
  name: string;
  label: string;
  state: AdminFormState;
  defaultValue: string;
  hint?: string;
  options?: Option[];
  inputMode?: "numeric" | "decimal";
};

function Field({ name, label, state, defaultValue, hint, options, inputMode }: FieldProps) {
  const id = useId();
  const error = state.fields?.[name];
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  const common = { id, name, defaultValue, "aria-invalid": Boolean(error), "aria-describedby": describedBy };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {options ? (
        <select {...common}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input {...common} type="text" inputMode={inputMode} autoComplete="off" />
      )}
      {error && (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

function Status({ state }: { state: AdminFormState }) {
  if (state.error) {
    return (
      <p className="form-alert" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="panel panel--muted" role="status">
        {state.ok}
      </p>
    );
  }
  return null;
}

const STATUS_OPTIONS: Option[] = [
  { value: "active", label: "Publicado" },
  { value: "draft", label: "Borrador (no se vende)" },
  { value: "archived", label: "Archivado" },
];

type ProductFormProps = { productId: string; price: string; status: string; requiresQuote: boolean };

export function ProductForm({ productId, price, status, requiresQuote }: ProductFormProps) {
  const [state, action, pending] = useActionState(updateProductAction, {});
  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />
      <input type="hidden" name="productId" value={productId} />
      <div className="form-grid">
        {requiresQuote ? (
          <p className="muted">Producto a pedido: se cotiza en cada encargo, no lleva precio fijo.</p>
        ) : (
          <Field
            name="price"
            label="Precio (ARS)"
            state={state}
            defaultValue={state.values?.price ?? price}
            hint="En pesos, por ejemplo 2500 o 2.500,50."
            inputMode="decimal"
          />
        )}
        <Field name="status" label="Estado" state={state} defaultValue={state.values?.status ?? status} options={STATUS_OPTIONS} />
      </div>
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}

const REASON_OPTIONS: Option[] = [
  { value: "restock", label: "Ingreso de mercadería" },
  { value: "adjustment", label: "Ajuste (rotura, recuento, error)" },
];

export function StockForm({ productId, onHand }: { productId: string; onHand: number }) {
  const [state, action, pending] = useActionState(countStockAction, {});
  return (
    <form action={action} className="quote-form" noValidate key={state.ok ?? "stock-form"}>
      <Status state={state} />
      <input type="hidden" name="productId" value={productId} />
      <div className="form-grid">
        <Field
          name="onHand"
          label="Unidades en depósito"
          state={state}
          defaultValue={state.values?.onHand ?? String(onHand)}
          hint="Cantidad contada hoy. Se registra la diferencia."
          inputMode="numeric"
        />
        <Field name="reason" label="Motivo" state={state} defaultValue={state.values?.reason ?? "restock"} options={REASON_OPTIONS} />
      </div>
      <Field name="note" label="Nota" state={state} defaultValue={state.values?.note ?? ""} hint="Obligatoria en ajustes." />
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : "Registrar stock"}
      </button>
    </form>
  );
}
