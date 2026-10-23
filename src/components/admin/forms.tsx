"use client";

import { useActionState, useId } from "react";
import { countStockAction, createProductAction, updateProductAction, type AdminFormState } from "@/app/admin/actions";

export type Option = { value: string; label: string };

type FieldProps = {
  name: string;
  label: string;
  state: AdminFormState;
  defaultValue: string;
  hint?: string;
  options?: Option[];
  multiline?: boolean;
  inputMode?: "numeric" | "decimal";
  required?: boolean;
};

function Field({ name, label, state, defaultValue, hint, options, multiline, inputMode, required }: FieldProps) {
  const id = useId();
  const error = state.fields?.[name];
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  const common = { id, name, defaultValue, "aria-invalid": Boolean(error), "aria-describedby": describedBy };
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && " *"}
      </label>
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
      ) : multiline ? (
        <textarea {...common} rows={4} />
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

function Checkbox({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked: boolean; hint?: string }) {
  const id = useId();
  return (
    <div className="field field--check">
      <input id={id} name={name} type="checkbox" defaultChecked={defaultChecked} aria-describedby={hint ? `${id}-hint` : undefined} />
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
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
  if (state.fields && Object.values(state.fields).some(Boolean)) {
    return (
      <p className="form-alert" role="alert">
        Revisá los campos marcados.
      </p>
    );
  }
  return null;
}

const STATUS_OPTIONS: Option[] = [
  { value: "active", label: "Publicado" },
  { value: "draft", label: "Borrador (no se ve en la tienda)" },
  { value: "archived", label: "Archivado (baja)" },
];

/** Current values of a product, as the form fields expect them. */
export type ProductFormValues = {
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  theme: string;
  tags: string;
  details: string;
  featured: boolean;
  catalogCode: string;
  price: string;
  status: string;
};

type ProductFormProps = {
  mode: "create" | "edit";
  productId?: string;
  requiresQuote?: boolean;
  initial: ProductFormValues;
  categories: Option[];
  themes: Option[];
};

/** One form for creating and editing: content, price and status. */
export function ProductForm({ mode, productId, requiresQuote = false, initial, categories, themes }: ProductFormProps) {
  const [state, action, pending] = useActionState(mode === "create" ? createProductAction : updateProductAction, {});
  const value = (key: keyof ProductFormValues) => state.values?.[key] ?? String(initial[key]);
  const featured = state.values ? state.values.featured === "on" : initial.featured;

  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />
      {productId && <input type="hidden" name="productId" value={productId} />}
      <div className="form-grid">
        <Field name="name" label="Nombre" state={state} defaultValue={value("name")} required />
        <Field
          name="slug"
          label="URL (slug)"
          state={state}
          defaultValue={value("slug")}
          hint={mode === "create" ? "Vacío = se genera desde el nombre." : "Cambiarla rompe los enlaces ya compartidos."}
        />
        <Field name="categoryId" label="Categoría" state={state} defaultValue={value("categoryId")} options={categories} required />
        <Field name="theme" label="Temática" state={state} defaultValue={value("theme")} options={themes} required />
        {requiresQuote ? (
          <p className="muted">Producto a pedido: se cotiza en cada encargo, no lleva precio fijo.</p>
        ) : (
          <Field
            name="price"
            label="Precio (ARS)"
            state={state}
            defaultValue={value("price")}
            hint={mode === "create" ? "En pesos (2500 o 2.500,50). Vacío si es a pedido." : "En pesos, por ejemplo 2500 o 2.500,50."}
            inputMode="decimal"
          />
        )}
        <Field name="status" label="Estado" state={state} defaultValue={value("status")} options={STATUS_OPTIONS} />
        <Field name="catalogCode" label="Código de catálogo" state={state} defaultValue={value("catalogCode")} hint="Opcional, 3 a 6 dígitos." inputMode="numeric" />
        <Field name="tags" label="Etiquetas" state={state} defaultValue={value("tags")} hint="Separadas por coma. Se usan en la búsqueda." />
      </div>
      <Field name="description" label="Descripción" state={state} defaultValue={value("description")} multiline />
      <Field name="details" label="Material y uso" state={state} defaultValue={value("details")} hint="Una línea por dato." multiline />
      <Checkbox name="featured" label="Destacado (aparece primero y en el inicio)" defaultChecked={featured} />

      {mode === "create" && (
        <fieldset className="admin-fieldset">
          <legend>Alta</legend>
          <Checkbox
            name="requiresQuote"
            label="Producto a pedido (se cotiza, sin precio ni stock)"
            defaultChecked={state.values?.requiresQuote === "on"}
          />
          <div className="form-grid">
            <Field name="sku" label="SKU" state={state} defaultValue={state.values?.sku ?? ""} hint="Vacío = se genera automáticamente." />
            <Field
              name="initialStock"
              label="Stock inicial"
              state={state}
              defaultValue={state.values?.initialStock ?? "0"}
              hint="Unidades contadas. Queda registrado como conteo inicial."
              inputMode="numeric"
            />
          </div>
        </fieldset>
      )}

      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : mode === "create" ? "Crear producto" : "Guardar cambios"}
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
