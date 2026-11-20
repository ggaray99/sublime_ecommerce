"use client";

import { useActionState, useId } from "react";
import {
  createDesignAction,
  deleteDesignAction,
  setDesignStatusAction,
  updateDesignAction,
  uploadDesignFileAction,
} from "@/app/admin/disenos/actions";
import { MOCKUP_KIND_LABELS, MOCKUP_KINDS, type DesignStatus, type MockupKind } from "@/lib/designs/kinds";
import type { AdminFormState } from "@/server/admin/guard";
import { ConfirmButton } from "./confirm-button";
import { Checkbox, Field, Status, type Option } from "./forms";

export type DesignFormValues = { name: string; slug: string; description: string; categoryId: string; kinds: MockupKind[] };

const ACCEPT = ".png,.jpg,.jpeg,.webp,.psd";
const FILE_HINT =
  "PNG con fondo transparente, 3000 px o más del lado mayor (≈300 dpi). También se aceptan JPG, WebP y PSD (guardado con «Maximizar compatibilidad»). SVG y PDF no.";

function DesignFileField({ state, label, required }: { state: AdminFormState; label: string; required?: boolean }) {
  const id = useId();
  const error = state.fields?.file;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && " *"}
      </label>
      <input
        id={id}
        name="file"
        type="file"
        accept={ACCEPT}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={[`${id}-hint`, error ? `${id}-error` : ""].filter(Boolean).join(" ")}
      />
      <p className="field__hint" id={`${id}-hint`}>
        {FILE_HINT} Hasta 15 MB.
      </p>
      {error && (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

/** One checkbox per base product; at least one is needed to publish. */
function KindsField({ state, checked }: { state: AdminFormState; checked: MockupKind[] }) {
  const id = useId();
  const error = state.fields?.kinds;
  return (
    <fieldset className="admin-fieldset" aria-describedby={[`${id}-hint`, error ? `${id}-error` : ""].filter(Boolean).join(" ")}>
      <legend>Disponible en</legend>
      <p className="field__hint" id={`${id}-hint`}>
        Elegí al menos un producto para poder publicarlo.
      </p>
      {MOCKUP_KINDS.map((kind) => (
        <div key={kind} className="field field--check">
          <input id={`${id}-${kind}`} name="kinds" type="checkbox" value={kind} defaultChecked={checked.includes(kind)} />
          <label htmlFor={`${id}-${kind}`}>{MOCKUP_KIND_LABELS[kind]}</label>
        </div>
      ))}
      {error && (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Data and base products of a design. Creating also takes the file and an optional "publish now". */
export function DesignForm({
  mode,
  designId,
  initial,
  categories,
}: {
  mode: "create" | "edit";
  designId?: string;
  initial: DesignFormValues;
  categories: Option[];
}) {
  const [state, action, pending] = useActionState(mode === "create" ? createDesignAction : updateDesignAction, {});
  const value = (key: Exclude<keyof DesignFormValues, "kinds">) => state.values?.[key] ?? initial[key];
  const kinds = state.values ? (state.values.kinds.split(",").filter(Boolean) as MockupKind[]) : initial.kinds;
  const categoryOptions = [{ value: "", label: "Sin categoría" }, ...categories];
  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />
      {designId && <input type="hidden" name="designId" value={designId} />}
      <div className="form-grid">
        <Field name="name" label="Nombre" state={state} defaultValue={value("name")} required />
        <Field
          name="slug"
          label="URL (slug)"
          state={state}
          defaultValue={value("slug")}
          hint={mode === "create" ? "Vacío = se genera desde el nombre." : "Cambiarla rompe los enlaces ya compartidos."}
        />
        <Field name="categoryId" label="Categoría" state={state} defaultValue={value("categoryId")} options={categoryOptions} />
      </div>
      <Field name="description" label="Descripción" state={state} defaultValue={value("description")} multiline />
      <KindsField key={kinds.join(",")} state={state} checked={kinds} />
      {mode === "create" && (
        <>
          <DesignFileField state={state} label="Archivo del diseño" required />
          <Checkbox
            name="publish"
            label="Publicar ahora"
            defaultChecked={state.values?.publish === "on"}
            hint="Si no, queda en borrador y lo publicás desde su página."
          />
        </>
      )}
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : mode === "create" ? "Crear diseño" : "Guardar cambios"}
      </button>
    </form>
  );
}

export function DesignFileUpload({ designId }: { designId: string }) {
  const [state, action, pending] = useActionState(uploadDesignFileAction, {});
  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />
      <input type="hidden" name="designId" value={designId} />
      <DesignFileField state={state} label="Reemplazar archivo" />
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Subiendo…" : "Subir archivo"}
      </button>
    </form>
  );
}

const STATUS_BUTTONS: { status: DesignStatus; label: string }[] = [
  { status: "published", label: "Publicar" },
  { status: "draft", label: "Pasar a borrador" },
  { status: "archived", label: "Archivar" },
];

/** One button per status the design can move to. */
export function DesignStatusForm({ designId, status }: { designId: string; status: DesignStatus }) {
  const [state, action, pending] = useActionState(setDesignStatusAction, {});
  return (
    <form action={action}>
      <Status state={state} />
      <input type="hidden" name="designId" value={designId} />
      <div className="actions">
        {STATUS_BUTTONS.filter((button) => button.status !== status).map((button) => (
          <button
            key={button.status}
            type="submit"
            name="status"
            value={button.status}
            className={button.status === "published" ? "btn btn--coal" : "btn btn--ghost"}
            disabled={pending}
          >
            {button.label}
          </button>
        ))}
      </div>
    </form>
  );
}

export function DeleteDesignForm({ designId, name }: { designId: string; name: string }) {
  const [state, action] = useActionState(deleteDesignAction, {});
  return (
    <form action={action}>
      <Status state={state} />
      <input type="hidden" name="designId" value={designId} />
      <ConfirmButton message={`¿Eliminar el diseño "${name}" y sus archivos? No se puede deshacer.`} className="btn btn--ghost">
        Eliminar diseño
      </ConfirmButton>
    </form>
  );
}
