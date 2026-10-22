"use client";

import { useSearchParams } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { productBySlug } from "@/data/products";
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

export function QuoteForm() {
  const searchParams = useSearchParams();
  const product = productBySlug(searchParams.get("producto") ?? "");
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

  const fieldId = (field: QuoteField) => `${id}-${field}`;
  const describedBy = (field: QuoteField, hint?: boolean) =>
    [hint ? `${fieldId(field)}-hint` : "", errors[field] ? `${fieldId(field)}-error` : ""].filter(Boolean).join(" ") ||
    undefined;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(fieldId(firstInvalid))}`)?.focus();
      return;
    }
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
    errors[field] && (
      <p className="field__error" id={`${fieldId(field)}-error`}>
        {errors[field]}
      </p>
    );

  const errorCount = Object.keys(errors).length;

  return (
    <form ref={formRef} className="quote-form" noValidate onSubmit={onSubmit}>
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
            defaultValue={defaultType}
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
          defaultValue={product ? `Me interesa algo similar a "${product.name}". ` : ""}
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
            maxLength={300}
            placeholder="Ej.: estilo de una ilustración, una paleta, un link"
            aria-invalid={Boolean(errors.reference)}
            aria-describedby={describedBy("reference")}
          />
          {errorText("reference")}
        </div>
        <div className="field">
          <label htmlFor={fieldId("file")}>Archivo de referencia (opcional)</label>
          <p className="field__hint" id={`${fieldId("file")}-hint`}>
            PNG, JPG, WEBP o PDF hasta 5 MB. Solo se valida en tu navegador: no se sube.
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
      </div>

      <div className="quote-form__footer">
        <button type="submit" className="btn btn--acid btn--lg">
          Simular envío
        </button>
        <p className="fine-print">
          * Campos obligatorios. Este formulario es una simulación local: no envía ni almacena datos.
        </p>
      </div>
    </form>
  );
}
