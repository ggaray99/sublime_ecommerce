"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useId, useRef, useState, type FormEvent } from "react";
import { submitCustomRequestAction, type RequestFormState } from "@/app/encargos/actions";
import type { Product } from "@/data/products";
import {
  ACCEPTED_FILE_TYPES,
  quoteProductTypes,
  validateQuote,
  type QuoteErrors,
  type QuoteField,
  type QuoteInput,
} from "@/lib/quote";

const fieldOrder: QuoteField[] = ["name", "email", "productType", "quantity", "idea", "reference", "file"];

const suggestedType: Record<string, (typeof quoteProductTypes)[number]> = {
  stickers: "Stickers troquelados",
  packs: "Pack de stickers",
  indumentaria: "Remeras e indumentaria",
  dtf: "Planchas DTF",
  vinilos: "Vinilos",
};

/**
 * `live` (staging/previews): the request is saved and the customer gets a private
 * page to follow it. Otherwise it is the original local simulation.
 * `uploads`: private file storage is configured.
 */
export type QuoteReference = Pick<Product, "slug" | "name" | "category">;

/** `references`: products a request can start from (?producto=slug), names only. */
export function QuoteForm({ live = false, uploads = false, references = [] }: { live?: boolean; uploads?: boolean; references?: QuoteReference[] }) {
  const searchParams = useSearchParams();
  const slug = searchParams.get("producto") ?? "";
  const product = slug ? references.find((candidate) => candidate.slug === slug) : undefined;
  const defaultType =
    product?.slug === "etiquetas-para-tu-marca"
      ? "Etiquetas para marca"
      : product?.slug === "stickers-a-medida"
        ? "Stickers troquelados"
        : (product && suggestedType[product.category]) || "";

  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<QuoteErrors>({});
  const [submitted, setSubmitted] = useState<QuoteInput | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [serverState, formAction, pending] = useActionState<RequestFormState, FormData>(submitCustomRequestAction, {});
  // One key per form: a double click returns the same request.
  const [idempotencyKey] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}`));
  const shownErrors: QuoteErrors = { ...(serverState.fields as QuoteErrors | undefined), ...errors };
  const value = (name: string) => serverState.values?.[name];

  const fieldId = (field: QuoteField) => `${id}-${field}`;
  const describedBy = (field: QuoteField, hint?: boolean) =>
    [hint ? `${fieldId(field)}-hint` : "", shownErrors[field] ? `${fieldId(field)}-error` : ""].filter(Boolean).join(" ") ||
    undefined;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const file = data.get("file");
    const input: QuoteInput = {
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      productType: String(data.get("productType") ?? ""),
      quantity: String(data.get("quantity") ?? ""),
      idea: String(data.get("idea") ?? ""),
      reference: String(data.get("reference") ?? ""),
      file: file instanceof File && file.size > 0 ? { name: file.name, size: file.size, type: file.type } : null,
    };
    const nextErrors = validateQuote(input);
    setErrors(nextErrors);

    const firstInvalid = fieldOrder.find((field) => nextErrors[field]);
    if (firstInvalid) {
      event.preventDefault();
      formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(fieldId(firstInvalid))}`)?.focus();
      return;
    }
    // Live: the form action sends it to the server.
    if (live) return;
    event.preventDefault();
    // Nothing leaves the browser: the "submission" only lives in component state.
    setSubmitted(input);
    requestAnimationFrame(() => resultRef.current?.focus());
  }

  if (submitted) {
    return (
      <div className="panel panel--result" ref={resultRef} tabIndex={-1}>
        <p className="kicker">Simulación local completada</p>
        <h2>Tu solicitud no fue enviada a ningún negocio.</h2>
        <p>
          Así se vería la confirmación de un encargo. Los datos que escribiste no se guardaron ni se enviaron: se borran al
          salir de esta página.
        </p>
        <dl className="quote-summary">
          <div>
            <dt>Tipo de producto</dt>
            <dd>{submitted.productType}</dd>
          </div>
          <div>
            <dt>Cantidad aproximada</dt>
            <dd>{submitted.quantity}</dd>
          </div>
          <div>
            <dt>Archivo de referencia</dt>
            <dd>{submitted.file ? `${submitted.file.name} (no se subió)` : "Sin archivo"}</dd>
          </div>
        </dl>
        <button
          type="button"
          className="btn btn--acid"
          onClick={() => {
            setSubmitted(null);
            setErrors({});
          }}
        >
          Simular otro encargo
        </button>
      </div>
    );
  }

  const errorText = (field: QuoteField) =>
    shownErrors[field] && (
      <p className="field__error" id={`${fieldId(field)}-error`}>
        {shownErrors[field]}
      </p>
    );

  const errorCount = Object.keys(shownErrors).length;

  return (
    <form ref={formRef} className="quote-form" noValidate onSubmit={onSubmit} action={live ? formAction : undefined}>
      {live && (
        <>
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <input type="hidden" name="productSlug" value={product?.slug ?? ""} />
          {/* Honeypot: invisible to people, filled in by simple bots. */}
          <div className="visually-hidden" aria-hidden="true">
            <label htmlFor={fieldId("name") + "-w"}>No completar</label>
            <input id={fieldId("name") + "-w"} name="website" tabIndex={-1} autoComplete="off" />
          </div>
        </>
      )}
      {serverState.error && (
        <p className="form-alert" role="alert">
          {serverState.error}
        </p>
      )}
      {errorCount > 0 && (
        <p className="form-alert" role="alert">
          Revisá {errorCount === 1 ? "1 campo marcado" : `${errorCount} campos marcados`} antes de continuar.
        </p>
      )}
      {product && (
        <p className="panel panel--muted">
          Referencia: <strong>{product.name}</strong>. Podés cambiar cualquier dato.
        </p>
      )}

      <div className="form-grid">
        <div className="field">
          <label htmlFor={fieldId("name")}>Nombre *</label>
          <input
            id={fieldId("name")}
            name="name"
            defaultValue={value("name")}
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy("name")}
          />
          {errorText("name")}
        </div>
        <div className="field">
          <label htmlFor={fieldId("email")}>Email de contacto *</label>
          <input
            id={fieldId("email")}
            name="email"
            defaultValue={value("email")}
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={describedBy("email")}
          />
          {errorText("email")}
        </div>
        <div className="field">
          <label htmlFor={fieldId("productType")}>Tipo de producto *</label>
          <select
            id={fieldId("productType")}
            name="productType"
            defaultValue={value("productType") ?? defaultType}
            aria-invalid={Boolean(errors.productType)}
            aria-describedby={describedBy("productType")}
          >
            <option value="">Elegí una opción</option>
            {quoteProductTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
          {errorText("productType")}
        </div>
        <div className="field">
          <label htmlFor={fieldId("quantity")}>Cantidad aproximada *</label>
          <input
            id={fieldId("quantity")}
            name="quantity"
            defaultValue={value("quantity")}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            aria-invalid={Boolean(errors.quantity)}
            aria-describedby={describedBy("quantity")}
          />
          {errorText("quantity")}
        </div>
      </div>

      <div className="field">
        <label htmlFor={fieldId("idea")}>Contanos tu idea *</label>
        <p className="field__hint" id={`${fieldId("idea")}-hint`}>
          Formato, colores, medidas aproximadas, dónde lo vas a usar. Mínimo 20 caracteres.
        </p>
        <textarea
          id={fieldId("idea")}
          name="idea"
          rows={6}
          maxLength={1500}
          defaultValue={value("idea") ?? (product ? `Me interesa algo similar a "${product.name}". ` : "")}
          aria-invalid={Boolean(errors.idea)}
          aria-describedby={describedBy("idea", true)}
        />
        {errorText("idea")}
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor={fieldId("reference")}>Referencia en texto (opcional)</label>
          <input
            id={fieldId("reference")}
            name="reference"
            defaultValue={value("reference")}
            maxLength={300}
            placeholder="Ej.: estilo de una ilustración, una paleta, un link"
            aria-invalid={Boolean(errors.reference)}
            aria-describedby={describedBy("reference")}
          />
          {errorText("reference")}
        </div>
        {(!live || uploads) && (
        <div className="field">
          <label htmlFor={fieldId("file")}>Archivo de referencia (opcional)</label>
          <p className="field__hint" id={`${fieldId("file")}-hint`}>
            {live
              ? "PNG, JPG, WEBP o PDF hasta 4 MB. Es privado: solo lo ven vos y el equipo."
              : "PNG, JPG, WEBP o PDF hasta 4 MB. Solo se valida en tu navegador: no se sube."}
          </p>
          <input
            id={fieldId("file")}
            name="file"
            type="file"
            accept={ACCEPTED_FILE_TYPES.join(",")}
            aria-invalid={Boolean(errors.file)}
            aria-describedby={describedBy("file", true)}
          />
          {errorText("file")}
        </div>
        )}
      </div>

      <div className="quote-form__footer">
        <button type="submit" className="btn btn--acid btn--lg" disabled={pending}>
          {live ? (pending ? "Enviando…" : "Enviar solicitud") : "Simular envío"}
        </button>
        <p className="fine-print">
          {live
            ? "* Campos obligatorios. Te respondemos con un presupuesto por email."
            : "* Campos obligatorios. Este formulario es una simulación local: no envía ni almacena datos."}
        </p>
      </div>
    </form>
  );
}
