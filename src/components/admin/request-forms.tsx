"use client";

import { useActionState } from "react";
import { requestAction, sendQuoteAction } from "@/app/admin/encargos/actions";
import type { AdminFormState } from "@/server/admin/guard";
import type { RequestStatus } from "@/server/custom-requests/repository";
import { Field, Status } from "./forms";

type QuoteInitial = { amount: string; deposit: string; message: string; validUntil: string; etaDays: string };

export function QuoteResponseForm({ requestId, initial, resend }: { requestId: string; initial: QuoteInitial; resend: boolean }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(sendQuoteAction, {});
  const value = (key: keyof QuoteInitial) => state.values?.[key] ?? initial[key];
  return (
    <form action={action} className="quote-form" noValidate>
      <Status state={state} />
      <input type="hidden" name="requestId" value={requestId} />
      <div className="form-grid">
        <Field name="amount" label="Total (ARS)" state={state} defaultValue={value("amount")} inputMode="decimal" required />
        <Field
          name="deposit"
          label="Seña sugerida (ARS)"
          state={state}
          defaultValue={value("deposit")}
          hint="Opcional. Informativa: no se cobra online todavía."
          inputMode="decimal"
        />
        <div className="field">
          <label htmlFor={`valid-${requestId}`}>Válido hasta *</label>
          <input id={`valid-${requestId}`} name="validUntil" type="date" defaultValue={value("validUntil")} aria-invalid={Boolean(state.fields?.validUntil)} />
          {state.fields?.validUntil && <p className="field__error">{state.fields.validUntil}</p>}
        </div>
        <Field name="etaDays" label="Días de producción" state={state} defaultValue={value("etaDays")} hint="Hábiles, desde la aprobación." inputMode="numeric" />
      </div>
      <Field name="message" label="Mensaje para el cliente" state={state} defaultValue={value("message")} hint="Qué incluye, materiales, condiciones." multiline />
      <button type="submit" className="btn btn--acid" disabled={pending}>
        {pending ? "Enviando…" : resend ? "Actualizar presupuesto" : "Enviar presupuesto"}
      </button>
    </form>
  );
}

const BUTTONS: Partial<Record<RequestStatus, { intent: string; label: string; tone: string }[]>> = {
  received: [{ intent: "cancel", label: "Cancelar encargo", tone: "btn--ghost" }],
  quoted: [{ intent: "cancel", label: "Cancelar encargo", tone: "btn--ghost" }],
  accepted: [
    { intent: "produce", label: "Pasar a producción", tone: "btn--acid" },
    { intent: "cancel", label: "Cancelar encargo", tone: "btn--ghost" },
  ],
  in_production: [
    { intent: "deliver", label: "Marcar entregado", tone: "btn--acid" },
    { intent: "cancel", label: "Cancelar encargo", tone: "btn--ghost" },
  ],
};

export function RequestActions({ requestId, status }: { requestId: string; status: RequestStatus }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(requestAction, {});
  const buttons = BUTTONS[status] ?? [];
  if (!buttons.length) return <p className="muted">No hay acciones para este estado.</p>;
  return (
    <form action={action} className="quote-form">
      <Status state={state} />
      <input type="hidden" name="requestId" value={requestId} />
      <Field name="note" label="Nota" state={state} defaultValue="" hint="Obligatoria al cancelar." />
      <div className="actions">
        {buttons.map((button) => (
          <button key={button.intent} type="submit" name="intent" value={button.intent} className={`btn ${button.tone}`} disabled={pending}>
            {button.label}
          </button>
        ))}
      </div>
    </form>
  );
}
