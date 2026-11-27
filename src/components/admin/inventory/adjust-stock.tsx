"use client";

import { createContext, useActionState, useContext, useId, useState, type ReactNode } from "react";
import { countStockAction } from "@/app/admin/actions";
import { SavedMessage, useSaveToast } from "@/components/admin/products/product-form-parts";
import { Button, Dialog, Input, Select, Textarea, VisuallyHidden, type SelectOption } from "@/components/admin/ui";
import type { AdminFormState } from "@/server/admin/guard";
import { adjustmentConfirmText, expectedResultText, planAdjustment, type AdjustMode } from "./detail-helpers";
import styles from "./detail.module.css";

/** A tracked, active variant the dialog can adjust. */
export type AdjustableVariant = { sku: string; label: string; onHand: number; reserved: number };

/** The action's result, tagged with the SKU that produced it so only its dialog shows the errors. */
type ActionState = AdminFormState & { sku?: string };

const NO_RESULT: ActionState = {};

const REASON_OPTIONS: SelectOption[] = [
  { value: "restock", label: "Reposición" },
  { value: "adjustment", label: "Ajuste (rotura, recuento, error)" },
];

type AdjustContext = { show: (sku: string) => void };

const Context = createContext<AdjustContext | null>(null);

type ProviderProps = {
  productId: string;
  /** MAX_STOCK of the server validation, passed by the page. */
  maxStock: number;
  variants: AdjustableVariant[];
  children: ReactNode;
};

/**
 * Holds the stock adjustment for every variant of the page: one
 * useActionState (stays mounted while the page revalidates), one Dialog and
 * the inline result. Submits the existing countStockAction with the absolute
 * count, as the product page's stock form does.
 */
export function AdjustStockProvider({ productId, maxStock, variants, children }: ProviderProps) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(
    async (previous, form) => ({ ...(await countStockAction(previous, form)), sku: String(form.get("sku") ?? "") }),
    NO_RESULT,
  );
  // The last variant opened stays rendered after closing, so the Dialog can close and return focus.
  const [activeSku, setActiveSku] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // Each opening starts clean; older results never show in a new dialog.
  const [session, setSession] = useState(0);
  const [baseline, setBaseline] = useState<ActionState>(NO_RESULT);
  useSaveToast(state);

  const fresh = state !== baseline;
  const variant = variants.find((item) => item.sku === activeSku) ?? null;

  function show(sku: string) {
    setBaseline(state);
    setSession((count) => count + 1);
    setActiveSku(sku);
    setOpen(true);
  }

  return (
    <Context.Provider value={{ show }}>
      <div className={styles.feedback}>
        <SavedMessage state={state} />
      </div>
      {children}
      {variant && (
        <AdjustDialog
          key={`${variant.sku}:${session}`}
          productId={productId}
          maxStock={maxStock}
          variant={variant}
          // A successful count closes the dialog; the page reloads with the new stock.
          open={open && !(fresh && state.ok)}
          onClose={() => setOpen(false)}
          result={fresh && state.sku === variant.sku ? state : NO_RESULT}
          pending={pending}
          dispatch={dispatch}
        />
      )}
    </Context.Provider>
  );
}

/** "Ajustar" button of one variant row; needs AdjustStockProvider above it. */
export function AdjustStockButton({ sku, label }: { sku: string; label: string }) {
  const context = useContext(Context);
  if (!context) return null;
  return (
    <Button size="sm" onClick={() => context.show(sku)}>
      Ajustar<VisuallyHidden> el stock de {label}</VisuallyHidden>
    </Button>
  );
}

type DialogProps = {
  productId: string;
  maxStock: number;
  variant: AdjustableVariant;
  open: boolean;
  onClose: () => void;
  result: ActionState;
  pending: boolean;
  dispatch: (form: FormData) => void;
};

function AdjustDialog({ productId, maxStock, variant, open, onClose, result, pending, dispatch }: DialogProps) {
  const formId = useId();
  const [mode, setMode] = useState<AdjustMode>("delta");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("restock");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  // Errors show once the person tries to continue; the preview updates live.
  const [checked, setChecked] = useState(false);

  const plan = planAdjustment({ onHand: variant.onHand, reserved: variant.reserved, mode, amount, reason, note, maxStock });
  const serverFields = result.fields ?? {};
  // Field errors of the server (e.g. a count that changed meanwhile) also show on the confirmation step.
  const serverMessage = result.error ?? Object.values(serverFields).find(Boolean);
  const amountError = (checked ? plan.errors.amount : undefined) ?? serverFields.onHand;
  const noteError = (checked ? plan.errors.note : undefined) ?? serverFields.note;
  // Below zero or below the reserved units: blocked right away, with the reason.
  const blocked = plan.result !== null && plan.errors.amount;
  const previewText = blocked
    ? plan.errors.amount
    : plan.result !== null
      ? expectedResultText(plan.result, variant.reserved)
      : "Ingresá una cantidad para ver el resultado.";

  function review() {
    setChecked(true);
    if (plan.valid) setStep("confirm");
  }

  const confirming = step === "confirm" && plan.result !== null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={`Ajustar stock · ${variant.label}`}
      description={`SKU ${variant.sku}. Se registra como movimiento de inventario con tu usuario.`}
      dismissible={!pending}
      actions={
        confirming ? (
          <>
            <Button variant="secondary" onClick={() => setStep("edit")} disabled={pending}>
              Volver
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={pending}>
              Confirmar ajuste
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={review}>
              Revisar ajuste
            </Button>
          </>
        )
      }
    >
      <form
        id={formId}
        action={dispatch}
        className={styles.dialogBody}
        onSubmit={(event) => {
          // Enter in a field reviews first; only the confirmation step submits.
          if (!confirming) {
            event.preventDefault();
            review();
          }
        }}
      >
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="sku" value={variant.sku} />
        <input type="hidden" name="onHand" value={plan.result === null ? "" : String(plan.result)} />
        <input type="hidden" name="reason" value={reason} />
        <input type="hidden" name="note" value={note.trim()} />

        <dl className={styles.facts}>
          <div>
            <dt>Cantidad actual</dt>
            <dd>{variant.onHand}</dd>
          </div>
          <div>
            <dt>Reservado</dt>
            <dd>{variant.reserved}</dd>
          </div>
          <div>
            <dt>Disponible</dt>
            <dd>{variant.onHand - variant.reserved}</dd>
          </div>
        </dl>

        {serverMessage && (
          <p className={styles.dialogError} role="alert">
            {serverMessage}
          </p>
        )}

        {confirming ? (
          <div className={styles.body}>
            <p className={styles.confirmQuestion}>{adjustmentConfirmText(variant.onHand, plan.result as number)}</p>
            <p className={styles.text}>{expectedResultText(plan.result as number, variant.reserved)}</p>
            <p className={styles.meta}>
              Motivo: {reason === "adjustment" ? "Ajuste" : "Reposición"}
              {note.trim() && ` · Nota: ${note.trim()}`}
            </p>
          </div>
        ) : (
          <>
            <fieldset className={styles.modes}>
              <legend>Cómo querés cargarlo</legend>
              <label className={styles.radio}>
                <input type="radio" name="adjust-mode" checked={mode === "delta"} onChange={() => setMode("delta")} />
                Sumar o restar unidades
              </label>
              <label className={styles.radio}>
                <input type="radio" name="adjust-mode" checked={mode === "total"} onChange={() => setMode("total")} />
                Contar el total
              </label>
            </fieldset>
            <div className={styles.dialogGrid}>
              <Input
                label={mode === "delta" ? "Cantidad a sumar o restar" : "Total contado"}
                hint={mode === "delta" ? "Ej.: 5 para sumar, -3 para restar." : "Unidades que hay en depósito ahora."}
                inputMode={mode === "delta" ? "text" : "numeric"}
                required
                autoComplete="off"
                value={amount}
                onChange={(event) => setAmount(event.currentTarget.value)}
                error={amountError}
              />
              <Select label="Motivo" options={REASON_OPTIONS} value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
            </div>
            <Textarea
              label="Nota"
              hint={reason === "adjustment" ? "Obligatoria en ajustes. Queda en el movimiento." : "Opcional. Queda en el movimiento."}
              required={reason === "adjustment"}
              maxLength={200}
              rows={2}
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              error={noteError}
            />
            <p className={`${styles.preview} ${blocked ? styles.previewBlocked : ""}`} aria-live="polite">
              {previewText}
            </p>
          </>
        )}
      </form>
    </Dialog>
  );
}
