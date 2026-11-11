"use client";

import { useActionState } from "react";
import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from "@/app/admin/categorias/actions";
import { Checkbox, Field, FileField, Status } from "./forms";

export type CategoryFormValues = { id: string; label: string; tagline: string; description: string; sortOrder: string; active: boolean };

export function CategoryForm({
  mode,
  initial,
  withImage = false,
}: {
  mode: "create" | "edit";
  initial: CategoryFormValues;
  /** Create form only: an optional photo, uploaded together with the category. */
  withImage?: boolean;
}) {
  const [state, action, pending] = useActionState(mode === "create" ? createCategoryAction : updateCategoryAction, {});
  const value = (key: Exclude<keyof CategoryFormValues, "active">) => state.values?.[key] ?? initial[key];
  const active = state.values ? state.values.active === "on" : initial.active;
  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />
      {mode === "edit" && <input type="hidden" name="categoryId" value={initial.id} />}
      <div className="form-grid">
        <Field name="label" label="Nombre" state={state} defaultValue={value("label")} required />
        {mode === "create" && (
          <Field
            name="id"
            label="Identificador"
            state={state}
            defaultValue={value("id")}
            hint="Vacío = desde el nombre. No se cambia después."
          />
        )}
        <Field name="tagline" label="Bajada" state={state} defaultValue={value("tagline")} hint="Frase corta para las tarjetas." />
        <Field name="sortOrder" label="Orden" state={state} defaultValue={value("sortOrder")} hint="Menor = aparece antes." inputMode="numeric" />
      </div>
      <Field name="description" label="Descripción" state={state} defaultValue={value("description")} multiline />
      {mode === "create" && withImage && <FileField state={state} label="Imagen (opcional)" />}
      <Checkbox name="active" label="Visible en la tienda" defaultChecked={active} hint="Si la ocultás, también se ocultan sus productos." />
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : mode === "create" ? "Crear categoría" : "Guardar cambios"}
      </button>
    </form>
  );
}

export function DeleteCategoryForm({ categoryId, label }: { categoryId: string; label: string }) {
  const [state, action, pending] = useActionState(deleteCategoryAction, {});
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`¿Eliminar la categoría "${label}"? No se puede deshacer.`)) event.preventDefault();
      }}
    >
      <Status state={state} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <button type="submit" className="btn btn--ghost" disabled={pending}>
        {pending ? "Eliminando…" : "Eliminar categoría"}
      </button>
    </form>
  );
}
