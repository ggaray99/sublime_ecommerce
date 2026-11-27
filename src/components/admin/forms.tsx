"use client";

import { useId } from "react";
import type { AdminFormState } from "@/server/admin/guard";

export { Field, type Option } from "../form-field";

export function Checkbox({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked: boolean; hint?: string }) {
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

const ACCEPT = "image/jpeg,image/png,image/webp";
const HINT = "JPG, PNG o WebP, hasta 4 MB, entre 400 y 4000 px por lado.";

export function FileField({ state, label = "Archivo" }: { state: AdminFormState; label?: string }) {
  const id = useId();
  const error = state.fields?.file;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name="file"
        type="file"
        accept={ACCEPT}
        aria-invalid={Boolean(error)}
        aria-describedby={[`${id}-hint`, error ? `${id}-error` : ""].filter(Boolean).join(" ")}
      />
      <p className="field__hint" id={`${id}-hint`}>
        {HINT}
      </p>
      {error && (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function Status({ state }: { state: AdminFormState }) {
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

/** Moved to the products module; re-exported for the helpers in shared.tsx. */
export type { ProductFormValues } from "./products/product-form";
