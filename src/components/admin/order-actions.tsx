"use client";

import { useActionState, useId, useState } from "react";
import { orderAction } from "@/app/admin/pedidos/actions";
import { orderActionsFor, type OrderActionOption, type OrderIntent } from "@/components/admin/orders/detail-helpers";
import styles from "@/components/admin/orders/detail.module.css";
import { SavedMessage, useSaveToast } from "@/components/admin/products/product-form-parts";
import { Button, Dialog, Input, Textarea, type ButtonVariant } from "@/components/admin/ui";
import type { AdminFormState } from "@/server/admin/guard";
import type { OrderStatus } from "@/server/orders/repository";

/** The action's result, tagged with the intent that produced it so only its dialog shows the errors. */
type ActionState = AdminFormState & { intent?: string };

const NO_RESULT: ActionState = {};

type Props = {
  orderId: string;
  /** "SUB-n", for the dialog questions. */
  code: string;
  status: OrderStatus;
  /** `shipping` orders go out with tracking before being delivered; pickups are delivered directly. */
  shipping: boolean;
};

/**
 * Actions of one order. Each available action (same as before, by status)
 * opens its own Dialog that explains what happens and holds its fields; every
 * dialog submits `orderAction` with the same field names (orderId, intent,
 * note, carrier, trackingCode, trackingUrl). Results: a toast plus the text
 * beside the actions; errors stay inside the dialog.
 */
export function OrderActions({ orderId, code, status, shipping }: Props) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    async (previous, form) => ({ ...(await orderAction(previous, form)), intent: String(form.get("intent") ?? "") }),
    NO_RESULT,
  );
  const [openIntent, setOpenIntent] = useState<OrderIntent | null>(null);
  // The result present when the dialog opened: older results never show in it.
  const [baseline, setBaseline] = useState<ActionState>(NO_RESULT);
  useSaveToast(state);

  const fresh = state !== baseline;
  const actions = orderActionsFor(status, shipping ? "shipping" : "pickup");

  function show(intent: OrderIntent) {
    setBaseline(state);
    setOpenIntent(intent);
  }

  return (
    <div className={styles.actionsBody}>
      {actions.length ? (
        <div className={styles.actionButtons}>
          {actions.map((action, index) => (
            <ActionDialog
              key={action.intent}
              action={action}
              orderId={orderId}
              code={code}
              status={status}
              shipping={shipping}
              primary={index === 0 && action.intent !== "cancel"}
              // A successful action closes its dialog; the page reloads with the new status.
              open={openIntent === action.intent && !(fresh && state.ok)}
              onShow={() => show(action.intent)}
              onClose={() => setOpenIntent(null)}
              result={fresh && state.intent === action.intent ? state : NO_RESULT}
              pending={pending}
              dispatch={dispatch}
            />
          ))}
        </div>
      ) : (
        <p className={styles.muted}>No hay acciones para este estado.</p>
      )}
      <SavedMessage state={state} />
    </div>
  );
}

type DialogCopy = { title: string; description: string; confirm: string; variant: ButtonVariant };

function copyFor(intent: OrderIntent, code: string, status: OrderStatus, shipping: boolean): DialogCopy {
  switch (intent) {
    case "confirm":
      return status === "expired"
        ? {
            title: `¿Confirmar el pago tardío de ${code}?`,
            description:
              "La reserva ya venció. Si todavía hay stock, se toma y el pedido queda pagado; si no alcanza, el pedido queda en revisión para resolverlo con el cliente.",
            confirm: "Confirmar pago tardío",
            variant: "primary",
          }
        : {
            title: `¿Confirmar el pago de ${code}?`,
            description: "La reserva de stock pasa a ser una venta y el pedido queda pagado, listo para enviar o retirar.",
            confirm: "Confirmar pago",
            variant: "primary",
          };
    case "cancel":
      return {
        title: `¿Cancelar ${code}?`,
        description: `Se libera el stock reservado y el pedido queda cancelado. No se puede deshacer.${
          status === "needs_review" ? " El cliente ya pagó: la devolución se coordina fuera del panel." : ""
        }`,
        confirm: "Cancelar pedido",
        variant: "critical",
      };
    case "ship":
      return {
        title: `Marcar ${code} como enviado`,
        description: "El pedido pasa a Enviado con estos datos de seguimiento, que el cliente ve en su pedido.",
        confirm: "Marcar enviado",
        variant: "primary",
      };
    case "fulfill":
      return {
        title: `¿Marcar ${code} como entregado?`,
        description: shipping ? "Confirmá que el envío llegó al cliente." : "Confirmá que el cliente retiró el pedido en el taller.",
        confirm: "Marcar entregado",
        variant: "primary",
      };
  }
}

type ActionDialogProps = {
  action: OrderActionOption;
  orderId: string;
  code: string;
  status: OrderStatus;
  shipping: boolean;
  primary: boolean;
  open: boolean;
  onShow: () => void;
  onClose: () => void;
  result: ActionState;
  pending: boolean;
  dispatch: (form: FormData) => void;
};

function ActionDialog({ action, orderId, code, status, shipping, primary, open, onShow, onClose, result, pending, dispatch }: ActionDialogProps) {
  const formId = useId();
  const copy = copyFor(action.intent, code, status, shipping);
  // Controlled, so a failed submit keeps what was typed (React resets uncontrolled form fields).
  const [note, setNote] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const fields = result.fields ?? {};
  const cancel = action.intent === "cancel";

  return (
    <>
      <Button variant={cancel ? "critical" : primary ? "primary" : "secondary"} onClick={onShow} fullWidth>
        {action.label}
      </Button>
      <Dialog
        open={open}
        onClose={onClose}
        size={action.intent === "ship" ? "md" : "sm"}
        title={copy.title}
        description={copy.description}
        dismissible={!pending}
        actions={
          <>
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              Volver
            </Button>
            <Button type="submit" form={formId} variant={copy.variant} loading={pending}>
              {copy.confirm}
            </Button>
          </>
        }
      >
        <form id={formId} action={dispatch} className={styles.dialogForm}>
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="intent" value={action.intent} />
          {result.error && (
            <p className={styles.dialogError} role="alert">
              {result.error}
            </p>
          )}
          {action.intent === "ship" && (
            <>
              <Input
                name="carrier"
                label="Empresa de envío"
                hint="Ej.: Correo Argentino, Andreani, moto."
                required
                maxLength={60}
                value={carrier}
                onChange={(event) => setCarrier(event.target.value)}
                error={fields.carrier}
              />
              <div className={styles.dialogGrid}>
                <Input
                  name="trackingCode"
                  label="Código de seguimiento"
                  hint="Opcional."
                  maxLength={80}
                  value={trackingCode}
                  onChange={(event) => setTrackingCode(event.target.value)}
                  error={fields.trackingCode}
                />
                <Input
                  name="trackingUrl"
                  label="Enlace de seguimiento"
                  hint="Opcional (https://…)."
                  type="url"
                  inputMode="url"
                  value={trackingUrl}
                  onChange={(event) => setTrackingUrl(event.target.value)}
                  error={fields.trackingUrl}
                />
              </div>
            </>
          )}
          <Textarea
            name="note"
            label={cancel ? "Motivo de la cancelación" : "Nota"}
            hint={cancel ? "Obligatorio. Queda en el historial del pedido." : "Opcional. Queda en el historial del pedido (ej.: transferencia recibida)."}
            required={cancel}
            maxLength={500}
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            error={fields.note}
          />
        </form>
      </Dialog>
    </>
  );
}
