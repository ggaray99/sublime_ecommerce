"use client";

import { useActionState } from "react";
import { saveContactAction, saveLabPricingAction } from "@/app/admin/ajustes/actions";
import type { AdminFormState } from "@/server/admin/guard";
import { Field, Status } from "./forms";

export function ContactForm({ whatsapp }: { whatsapp: string }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(saveContactAction, {});
  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />
      <div className="form-grid">
        <Field
          name="whatsapp"
          label="WhatsApp del negocio"
          state={state}
          defaultValue={state.values?.whatsapp ?? (whatsapp ? `+${whatsapp}` : "")}
          hint="Ej.: +54 9 261 555 1234. Vacío = sin WhatsApp"
        />
      </div>
      <button type="submit" className="btn btn--coal" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
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
