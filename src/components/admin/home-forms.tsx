"use client";

import { useActionState } from "react";
import { saveHomeHeroAction } from "@/app/admin/portada/actions";
import type { AdminFormState } from "@/server/admin/guard";
import { Field, Status, type Option } from "./forms";

export type HeroFormValues = Record<
  | "kicker"
  | "titleLine1"
  | "titleLine2"
  | "lede"
  | "primaryLabel"
  | "primaryHref"
  | "secondaryLabel"
  | "secondaryHref"
  | "stamp"
  | "product1"
  | "product2"
  | "product3",
  string
>;

export function HomeHeroForm({ initial, products }: { initial: HeroFormValues; products: Option[] }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(saveHomeHeroAction, {});
  const value = (key: keyof HeroFormValues) => state.values?.[key] ?? initial[key];
  const productOptions = [{ value: "", label: "Automático (producto de siempre)" }, ...products];

  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />

      <fieldset className="admin-fieldset">
        <legend>Textos</legend>
        <Field name="kicker" label="Texto chico de arriba" state={state} defaultValue={value("kicker")} hint="Ej.: Stickers / DTF / Vinilos / Remeras" />
        <div className="form-grid">
          <Field name="titleLine1" label="Título, línea 1 (blanco)" state={state} defaultValue={value("titleLine1")} hint="Hasta 18 caracteres" required />
          <Field name="titleLine2" label="Título, línea 2 (celeste)" state={state} defaultValue={value("titleLine2")} hint="Hasta 18 caracteres" />
        </div>
        <Field name="lede" label="Texto de presentación" state={state} defaultValue={value("lede")} hint="Una o dos oraciones, hasta 240 caracteres" multiline />
        <Field name="stamp" label="Sello redondo" state={state} defaultValue={value("stamp")} hint="Ej.: DISEÑOS ORIGINALES. Vacío = sin sello" />
      </fieldset>

      <fieldset className="admin-fieldset">
        <legend>Botones</legend>
        <div className="form-grid">
          <Field name="primaryLabel" label="Botón principal: texto" state={state} defaultValue={value("primaryLabel")} required />
          <Field name="primaryHref" label="Botón principal: lleva a" state={state} defaultValue={value("primaryHref")} hint="Ej.: /tienda?categoria=stickers" required />
          <Field name="secondaryLabel" label="Botón secundario: texto" state={state} defaultValue={value("secondaryLabel")} hint="Vacío = sin segundo botón" />
          <Field name="secondaryHref" label="Botón secundario: lleva a" state={state} defaultValue={value("secondaryHref")} hint="Ej.: /encargos" />
        </div>
      </fieldset>

      <fieldset className="admin-fieldset">
        <legend>Fotos del collage</legend>
        <p className="muted">Se muestra la foto principal de cada producto, con su nombre y precio. Solo aparecen productos visibles en la tienda.</p>
        <div className="form-grid">
          <Field name="product1" label="Foto 1 (la más grande)" state={state} defaultValue={value("product1")} options={productOptions} />
          <Field name="product2" label="Foto 2 (arriba a la derecha)" state={state} defaultValue={value("product2")} options={productOptions} />
          <Field name="product3" label="Foto 3 (abajo a la derecha)" state={state} defaultValue={value("product3")} options={productOptions} />
        </div>
      </fieldset>

      <button type="submit" className="btn btn--acid btn--lg" disabled={pending}>
        {pending ? "Guardando…" : "Guardar portada"}
      </button>
    </form>
  );
}
