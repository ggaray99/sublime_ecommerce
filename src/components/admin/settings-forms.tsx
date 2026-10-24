"use client";

import { useActionState } from "react";
import { saveContactAction } from "@/app/admin/ajustes/actions";
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
