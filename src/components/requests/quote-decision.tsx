"use client";

import { useActionState } from "react";
import { decideQuoteAction, type DecisionState } from "@/app/encargo/[id]/actions";

export function QuoteDecision({ requestId, token }: { requestId: string; token: string }) {
  const [state, action, pending] = useActionState<DecisionState, FormData>(decideQuoteAction, {});
  if (state.ok) {
    return (
      <p className="panel panel--muted" role="status">
        {state.ok}
      </p>
    );
  }
  return (
    <form action={action} className="quote-form">
      {state.error && (
        <p className="form-alert" role="alert">
          {state.error}
        </p>
      )}
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="t" value={token} />
      <div className="field">
        <label htmlFor="decision-note">Comentario (opcional)</label>
        <textarea id="decision-note" name="note" rows={3} maxLength={500} />
      </div>
      <div className="actions">
        <button type="submit" name="decision" value="accept" className="btn btn--acid" disabled={pending}>
          Aceptar presupuesto
        </button>
        <button type="submit" name="decision" value="decline" className="btn btn--ghost" disabled={pending}>
          No me interesa
        </button>
      </div>
    </form>
  );
}
