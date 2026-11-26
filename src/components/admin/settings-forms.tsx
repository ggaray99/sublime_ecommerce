"use client";

import { useActionState } from "react";
import { saveContactAction, saveInstallmentsAction, saveLabPricingAction, savePageAction } from "@/app/admin/ajustes/actions";
import type { ContactSettings } from "@/server/settings/contact";
import { MAX_SECTIONS, type PageText } from "@/server/settings/pages";
import type { AdminFormState } from "@/server/admin/guard";
import { Checkbox, Field, Status } from "./forms";

export function ContactForm({ contact }: { contact: ContactSettings }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(saveContactAction, {});
  const value = (key: keyof ContactSettings) => state.values?.[key] ?? (key === "whatsapp" && contact.whatsapp ? `+${contact.whatsapp}` : contact[key]);
  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />
      <div className="form-grid">
        <Field name="whatsapp" label="WhatsApp del negocio" state={state} defaultValue={value("whatsapp")} hint="Ej.: +54 9 261 555 1234" />
        <Field name="email" label="Email" state={state} defaultValue={value("email")} hint="Ej.: hola@sublime.com.ar" />
        <Field name="phone" label="Teléfono" state={state} defaultValue={value("phone")} hint="Ej.: 261 555-1234" />
        <Field name="hours" label="Horario de atención" state={state} defaultValue={value("hours")} hint="Ej.: Lunes a viernes de 9 a 18" />
      </div>
      <Field name="address" label="Dirección" state={state} defaultValue={value("address")} hint="Ej.: Av. San Martín 1234, Mendoza" />
      <h3>Redes sociales</h3>
      <div className="form-grid">
        <Field name="instagram" label="Instagram" state={state} defaultValue={value("instagram")} hint="@usuario o link del perfil" />
        <Field name="facebook" label="Facebook" state={state} defaultValue={value("facebook")} hint="Nombre de la página o link" />
        <Field name="tiktok" label="TikTok" state={state} defaultValue={value("tiktok")} hint="@usuario o link del perfil" />
      </div>
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}

export function PageTextForm({ slug, initial }: { slug: string; initial: PageText }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(savePageAction, {});
  const saved = state.values;
  // Saved sections plus three empty rows to add more; a row left empty is ignored.
  const rows = Math.min(MAX_SECTIONS, Math.max(initial.sections.length + 3, 4));
  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />
      <input type="hidden" name="slug" value={slug} />
      <Field name="intro" label="Introducción" state={state} defaultValue={saved?.intro ?? initial.intro} multiline required />
      {Array.from({ length: rows }, (_, index) => {
        const row = index + 1;
        const section = initial.sections[index];
        return (
          <fieldset key={row} className="page-section-fields">
            <legend>Sección {row}</legend>
            <Field name={`title${row}`} label="Título" state={state} defaultValue={saved?.[`title${row}`] ?? section?.title ?? ""} />
            <Field
              name={`body${row}`}
              label="Texto"
              state={state}
              defaultValue={saved?.[`body${row}`] ?? section?.body ?? ""}
              hint="Dejá una línea en blanco para separar párrafos"
              multiline
            />
          </fieldset>
        );
      })}
      <p className="muted">Para quitar una sección, borrá su título y su texto.</p>
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : "Guardar página"}
      </button>
    </form>
  );
}

export type LabPricingValues = { sheetPrice: string; tiers: { min: string; percent: string }[] };

export function LabPricingForm({ initial }: { initial: LabPricingValues }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(saveLabPricingAction, {});
  const value = (key: string, fallback: string) => state.values?.[key] ?? fallback;
  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />
      <div className="form-grid">
        <Field name="sheetPrice" label="Precio por plancha (ARS)" state={state} defaultValue={value("sheetPrice", initial.sheetPrice)} inputMode="decimal" hint="Ej.: 10.001,10. Vacío = sin estimación" />
      </div>
      <div className="form-grid">
        {[1, 2, 3].map((row) => (
          <div key={row} className="promo-pair">
            <Field
              name={`tierMin${row}`}
              label={`Desde (planchas) · escala ${row}`}
              state={state}
              defaultValue={value(`tierMin${row}`, initial.tiers[row - 1]?.min ?? "")}
              inputMode="numeric"
              hint={row === 1 ? "Ej.: 4" : "Opcional"}
            />
            <Field
              name={`tierPercent${row}`}
              label="Descuento (%)"
              state={state}
              defaultValue={value(`tierPercent${row}`, initial.tiers[row - 1]?.percent ?? "")}
              inputMode="numeric"
              hint={row === 1 ? "Ej.: 10" : ""}
            />
          </div>
        ))}
      </div>
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : "Guardar precios"}
      </button>
    </form>
  );
}

export type InstallmentsValues = { enabled: boolean; count: string; minAmount: string };

export function InstallmentsForm({ initial }: { initial: InstallmentsValues }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(saveInstallmentsAction, {});
  const value = (key: "count" | "minAmount") => state.values?.[key] ?? initial[key];
  const enabled = state.values ? state.values.enabled === "on" : initial.enabled;
  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />
      <Checkbox
        key={String(enabled)}
        name="enabled"
        label="Mostrar cuotas sin interés en la tienda"
        defaultChecked={enabled}
        hint="Activalo solo si tu cuenta de Mercado Pago ofrece estas cuotas sin interés."
      />
      <div className="form-grid">
        <Field name="count" label="Cantidad de cuotas" state={state} defaultValue={value("count")} inputMode="numeric" hint="De 2 a 24. Ej.: 3" />
        <Field name="minAmount" label="Desde (ARS)" state={state} defaultValue={value("minAmount")} inputMode="numeric" hint="Precio mínimo del producto. Vacío = todos" />
      </div>
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cuotas"}
      </button>
    </form>
  );
}
