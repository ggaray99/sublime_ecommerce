"use client";

import { useActionState } from "react";
import { orderAction } from "@/app/admin/pedidos/actions";
import type { AdminFormState } from "@/server/admin/guard";
import type { OrderStatus } from "@/server/orders/repository";
import { Field, Status } from "./forms";

const AVAILABLE: Record<OrderStatus, { intent: string; label: string; tone: string }[]> = {
  pending_payment: [
    { intent: "confirm", label: "Confirmar pago", tone: "btn--acid" },
    { intent: "cancel", label: "Cancelar pedido", tone: "btn--ghost" },
  ],
  expired: [
    { intent: "confirm", label: "Confirmar pago tardío", tone: "btn--acid" },
    { intent: "cancel", label: "Cancelar pedido", tone: "btn--ghost" },
  ],
  needs_review: [{ intent: "cancel", label: "Cancelar pedido", tone: "btn--ghost" }],
  paid: [{ intent: "fulfill", label: "Marcar entregado", tone: "btn--acid" }],
  fulfilled: [],
  cancelled: [],
};

export function OrderActions({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(orderAction, {});
  const buttons = AVAILABLE[status];
  if (!buttons.length) return <p className="muted">No hay acciones para este estado.</p>;
  return (
    <form action={action} className="quote-form">
      <Status state={state} />
      <input type="hidden" name="orderId" value={orderId} />
      <Field name="note" label="Nota" state={state} defaultValue="" hint="Ej.: transferencia recibida, motivo de cancelación. Obligatoria al cancelar." />
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
