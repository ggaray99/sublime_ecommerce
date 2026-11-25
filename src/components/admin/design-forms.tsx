"use client";

import { useActionState, useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import {
  checkDesignFileAction,
  createDesignAction,
  deleteDesignAction,
  setDesignStatusAction,
  updateDesignAction,
  uploadDesignFileAction,
} from "@/app/admin/disenos/actions";
import { MOCKUP_KIND_LABELS, MOCKUP_KINDS, type DesignStatus, type MockupKind } from "@/lib/designs/kinds";
import type { GarmentColor } from "@/lib/designs/mockups";
import { formatFileSize, precheckDesignFile } from "@/lib/designs/upload";
import type { AdminFormState } from "@/server/admin/guard";
import { ConfirmButton } from "./confirm-button";
import { Checkbox, Field, Status, type Option } from "./forms";

export type DesignFormValues = {
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  kinds: MockupKind[];
  /** Checked color keys per kind; a kind that comes in colors and is missing here starts with all of them checked. */
  colors: Partial<Record<MockupKind, string[]>>;
  /** Checked theme ids. */
  themeIds: string[];
};

/** A design theme offered as a checkbox. */
export type ThemeOption = { id: string; label: string };

/** The colors each kind's base product comes in; kinds without colors are missing. */
export type KindColorOptions = Partial<Record<MockupKind, GarmentColor[]>>;

const COLORS_HINT = "Los colores salen de las variantes «Color» del producto base. Destildá los colores donde el diseño no queda bien.";

const ACCEPT = ".png,.jpg,.jpeg,.webp,.psd";
const FILE_HINT =
  "PNG con fondo transparente, 3000 px o más del lado mayor (≈300 dpi). También se aceptan JPG, WebP y PSD (guardado con «Maximizar compatibilidad»). SVG y PDF no.";

type PickedFile = { name: string; size: number; preview: string | null };
type FileCheck =
  | { state: "checking" }
  | { state: "ok"; width: number; height: number; warning: string | null }
  | { state: "error"; message: string }
  | { state: "unchecked" };

/** Browsers can show these right away; a PSD has no preview until it is saved. */
const PREVIEWABLE = /.(png|jpe?g|webp)$/i;

/**
 * The design file input. As soon as a file is picked it is checked on the server
 * (the same rules as saving, nothing is stored) and shown with the result; the
 * admin can remove it or pick another one before saving.
 */
function DesignFileField({ state, label, required }: { state: AdminFormState; label: string; required?: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  // Only the answer for the latest pick counts.
  const ticket = useRef(0);
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [check, setCheck] = useState<FileCheck>({ state: "unchecked" });
  const serverError = state.fields?.file;

  useEffect(() => {
    const preview = picked?.preview;
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [picked]);

  // React resets the form after each submit: the picked file goes with it.
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const onReset = () => {
      ticket.current++;
      setPicked(null);
      setCheck({ state: "unchecked" });
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  function remove() {
    ticket.current++;
    if (input.current) input.current.value = "";
    setPicked(null);
    setCheck({ state: "unchecked" });
  }

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const field = event.currentTarget;
    const file = field.files?.[0];
    const current = ++ticket.current;
    if (!file) {
      setPicked(null);
      setCheck({ state: "unchecked" });
      return;
    }
    const problem = precheckDesignFile(file);
    setPicked({ name: file.name, size: file.size, preview: !problem && PREVIEWABLE.test(file.name) ? URL.createObjectURL(file) : null });
    if (problem) {
      field.value = "";
      setCheck({ state: "error", message: problem });
      return;
    }
    setCheck({ state: "checking" });
    const body = new FormData();
    body.append("file", file);
    try {
      const result = await checkDesignFileAction(body);
      if (current !== ticket.current) return;
      if (result.ok) {
        setCheck({ state: "ok", width: result.width, height: result.height, warning: result.warning });
      } else {
        field.value = "";
        setCheck({ state: "error", message: result.error });
      }
    } catch {
      if (current === ticket.current) setCheck({ state: "unchecked" });
    }
  }

  const invalid = check.state === "error" || Boolean(serverError && !picked);
  return (
    <div className="field design-upload">
      <label htmlFor={id}>
        {label}
        {required && " *"}
      </label>
      <input
        ref={input}
        id={id}
        name="file"
        type="file"
        accept={ACCEPT}
        required={required}
        onChange={pick}
        aria-invalid={invalid}
        aria-describedby={[`${id}-hint`, picked ? `${id}-check` : serverError ? `${id}-error` : ""].filter(Boolean).join(" ")}
      />
      <p className="field__hint" id={`${id}-hint`}>
        {FILE_HINT} Hasta 15 MB.
      </p>
      {picked ? (
        <div className="design-upload__picked">
          {picked.preview && check.state !== "error" && (
            // A local blob of the picked file: next/image cannot optimize it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={picked.preview} alt="Vista previa del archivo elegido" className="design-upload__preview" />
          )}
          <div className="design-upload__info">
            <p className="design-upload__name">
              {picked.name} · {formatFileSize(picked.size)}
            </p>
            <div id={`${id}-check`} role="status">
              {check.state === "checking" && <p className="muted">Revisando el archivo…</p>}
              {check.state === "ok" && (
                <p className={check.warning ? "form-alert" : "design-upload__ok"}>
                  Archivo apto: {check.width} × {check.height} px.{check.warning && ` ${check.warning}`}
                </p>
              )}
              {check.state === "error" && <p className="field__error">{check.message} Elegí otro archivo.</p>}
              {check.state === "unchecked" && <p className="muted">No pudimos revisarlo ahora: se revisa al guardar.</p>}
            </div>
            <button type="button" className="link-button" onClick={remove}>
              Quitar archivo
            </button>
          </div>
        </div>
      ) : (
        serverError && (
          <p className="field__error" id={`${id}-error`}>
            {serverError}
          </p>
        )
      )}
    </div>
  );
}

/**
 * One checkbox per base product; at least one is needed to publish. A product
 * that comes in colors shows its colors inline, one checkbox each; colors of an
 * unchecked product are ignored when saving.
 */
function KindsField({
  state,
  checked,
  colors,
  kindColors,
}: {
  state: AdminFormState;
  checked: MockupKind[];
  colors: Partial<Record<MockupKind, string[]>>;
  kindColors: KindColorOptions;
}) {
  const id = useId();
  const error = state.fields?.kinds;
  const colorError = state.fields?.colors;
  const hasColors = MOCKUP_KINDS.some((kind) => (kindColors[kind] ?? []).length > 0);
  return (
    <fieldset
      className="admin-fieldset design-form__kinds"
      aria-describedby={[`${id}-hint`, error ? `${id}-error` : "", colorError ? `${id}-colors-error` : ""].filter(Boolean).join(" ")}
    >
      <legend>Disponible en</legend>
      <p className="field__hint" id={`${id}-hint`}>
        Elegí al menos un producto para poder publicarlo.
      </p>
      {hasColors && (
        <p className="field__hint" id={`${id}-colors-hint`}>
          {COLORS_HINT}
        </p>
      )}
      {MOCKUP_KINDS.map((kind) => {
        const options = kindColors[kind] ?? [];
        const picked = colors[kind] ?? options.map((color) => color.key);
        return (
          <div key={kind} className="design-form__kind">
            <label className="design-chip design-chip--strong">
              <input name="kinds" type="checkbox" value={kind} defaultChecked={checked.includes(kind)} />
              {MOCKUP_KIND_LABELS[kind]}
            </label>
            {options.length > 0 && (
              <fieldset className="design-form__colors" aria-describedby={`${id}-colors-hint`}>
                <legend className="visually-hidden">Colores de {MOCKUP_KIND_LABELS[kind].toLowerCase()}</legend>
                {options.map((color) => (
                  <label key={color.key} className="design-chip">
                    <input name={`colors-${kind}`} type="checkbox" value={color.key} defaultChecked={picked.includes(color.key)} />
                    {color.label}
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        );
      })}
      {error && (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
      {colorError && (
        <p className="field__error" id={`${id}-colors-error`}>
          {colorError}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Existing themes as checkboxes, plus a text box to add a new one: it is created
 * on save (or the one with the same name is reused) and linked to the design.
 */
function ThemesField({
  state,
  themes,
  checked,
  newTheme,
}: {
  state: AdminFormState;
  themes: ThemeOption[];
  checked: string[];
  newTheme: string;
}) {
  const id = useId();
  const error = state.fields?.themeIds;
  const newError = state.fields?.newTheme;
  return (
    <fieldset
      className="admin-fieldset design-form__themes"
      aria-describedby={[themes.length ? "" : `${id}-empty`, error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined}
    >
      <legend>Temáticas</legend>
      {themes.length > 0 ? (
        <div className="design-form__chips">
          {themes.map((theme) => (
            <label key={theme.id} className="design-chip">
              <input name="themes" type="checkbox" value={theme.id} defaultChecked={checked.includes(theme.id)} />
              {theme.label}
            </label>
          ))}
        </div>
      ) : (
        <p className="field__hint" id={`${id}-empty`}>
          Todavía no hay temáticas: creá la primera acá abajo.
        </p>
      )}
      <div className="field design-form__new-theme">
        <label htmlFor={`${id}-new`}>Nueva temática</label>
        <input
          id={`${id}-new`}
          name="newTheme"
          type="text"
          maxLength={60}
          autoComplete="off"
          defaultValue={newTheme}
          placeholder="Ej.: Fútbol"
          aria-invalid={Boolean(newError)}
          aria-describedby={[`${id}-new-hint`, newError ? `${id}-new-error` : ""].filter(Boolean).join(" ")}
        />
        <p className="field__hint" id={`${id}-new-hint`}>
          Opcional. Se crea al guardar y queda marcada; si ya existe, se usa esa.
        </p>
        {newError && (
          <p className="field__error" id={`${id}-new-error`}>
            {newError}
          </p>
        )}
      </div>
      {error && (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Data, themes, base products and colors of a design. Creating also takes the file and an optional "publish now". */
export function DesignForm({
  mode,
  designId,
  initial,
  categories,
  themes,
  kindColors,
}: {
  mode: "create" | "edit";
  designId?: string;
  initial: DesignFormValues;
  categories: Option[];
  themes: ThemeOption[];
  kindColors: KindColorOptions;
}) {
  const [state, action, pending] = useActionState(mode === "create" ? createDesignAction : updateDesignAction, {});
  const value = (key: Exclude<keyof DesignFormValues, "kinds" | "colors" | "themeIds">) => state.values?.[key] ?? initial[key];
  const kinds = state.values ? (state.values.kinds.split(",").filter(Boolean) as MockupKind[]) : initial.kinds;
  // After a failed save, what was checked; a kind with every color unchecked stays that way.
  const colors: DesignFormValues["colors"] = state.values
    ? Object.fromEntries(MOCKUP_KINDS.map((kind) => [kind, (state.values?.[`colors-${kind}`] ?? "").split(",").filter(Boolean)]))
    : initial.colors;
  const colorsKey = MOCKUP_KINDS.map((kind) => `${kind}:${(colors[kind] ?? []).join("+")}`).join(",");
  const themeIds = state.values ? (state.values.themes ?? "").split(",").filter(Boolean) : initial.themeIds;
  const newTheme = state.values?.newTheme ?? "";
  const themesKey = `${themes.map((theme) => theme.id).join(",")}|${themeIds.join(",")}|${newTheme}`;
  const categoryOptions = [{ value: "", label: "Sin categoría" }, ...categories];
  return (
    <form action={action} className="quote-form design-form" noValidate>
      <Status state={state} />
      {designId && <input type="hidden" name="designId" value={designId} />}
      <div className="design-form__grid">
        <Field name="name" label="Nombre" state={state} defaultValue={value("name")} required />
        <Field
          name="slug"
          label="URL (slug)"
          state={state}
          defaultValue={value("slug")}
          hint={mode === "create" ? "Vacío = se genera desde el nombre." : "Cambiarla rompe los enlaces ya compartidos."}
        />
        <div className="design-form__stack">
          <Field name="categoryId" label="Categoría" state={state} defaultValue={value("categoryId")} options={categoryOptions} />
          <Field name="description" label="Descripción" state={state} defaultValue={value("description")} multiline />
        </div>
        <ThemesField key={themesKey} state={state} themes={themes} checked={themeIds} newTheme={newTheme} />
      </div>
      <KindsField key={`${kinds.join(",")}|${colorsKey}`} state={state} checked={kinds} colors={colors} kindColors={kindColors} />
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
    <form action={action} className="quote-form design-form" noValidate>
      <Status state={state} />
      <input type="hidden" name="designId" value={designId} />
      <DesignFileField state={state} label="Cambiar archivo" />
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Subiendo…" : "Reemplazar archivo"}
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
