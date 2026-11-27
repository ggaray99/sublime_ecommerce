"use client";

import { useActionState, useState } from "react";
import { countStockAction } from "@/app/admin/actions";
import { Button, Input, Select, type SelectOption } from "@/components/admin/ui";
import type { AdminFormState } from "@/server/admin/guard";
import { ErrorSummary, fieldId, SavedMessage, useSaveToast } from "./product-form-parts";
import { stockDifference } from "./product-page-helpers";
import styles from "./product-page.module.css";

/** A variant that can be counted, with its current on-hand units. */
export type StockVariantOption = SelectOption & { onHand: number };

const REASON_OPTIONS: SelectOption[] = [
  { value: "restock", label: "Ingreso de mercadería" },
  { value: "adjustment", label: "Ajuste (rotura, recuento, error)" },
];

const LABELS: Record<string, string> = { sku: "Variante", onHand: "Unidades en depósito", reason: "Motivo", note: "Nota" };
const PREFIX = "stock";

/**
 * Stock count: the person enters the units counted (absolute number, as the
 * server expects) and sees, before saving, the difference it records.
 * `variants` (products with options): choose which variant was counted.
 */
export function StockForm({ productId, onHand, variants }: { productId: string; onHand: number; variants?: StockVariantOption[] }) {
  const [state, action, pending] = useActionState(countStockAction, {});
  useSaveToast(state);
  // After a count the page reloads the stock: new numbers remount the fields with them.
  const stockKey = variants ? variants.map((variant) => `${variant.value}:${variant.onHand}`).join(",") : String(onHand);
  return <StockFields key={stockKey} productId={productId} onHand={onHand} variants={variants} state={state} action={action} pending={pending} />;
}

function StockFields({
  productId,
  onHand,
  variants,
  state,
  action,
  pending,
}: {
  productId: string;
  onHand: number;
  variants?: StockVariantOption[];
  state: AdminFormState;
  action: (form: FormData) => void;
  pending: boolean;
}) {
  const onHandOf = (sku: string) => (variants ? (variants.find((variant) => variant.value === sku)?.onHand ?? 0) : onHand);
  const [sku, setSku] = useState(state.values?.sku ?? variants?.[0]?.value ?? "");
  const [counted, setCounted] = useState(state.values?.onHand ?? String(onHandOf(sku)));
  const [reason, setReason] = useState(state.values?.reason ?? "restock");
  const current = onHandOf(sku);
  const difference = stockDifference(current, counted);
  const differenceId = fieldId(PREFIX, "difference");
  // Restock only adds (docs/inventory-stabilization.md, 3): the server refuses it too.
  const restockDown = reason === "restock" && /^\d+$/.test(counted.trim()) && Number(counted) < current;

  return (
    <form action={action} noValidate className={styles.grid2Stack}>
      <ErrorSummary state={state} labels={LABELS} idPrefix={PREFIX} />
      <input type="hidden" name="productId" value={productId} />
      <div className={styles.grid2}>
        {variants && (
          <Select
            id={fieldId(PREFIX, "sku")}
            name="sku"
            label="Variante"
            options={variants}
            value={sku}
            onChange={(event) => {
              setSku(event.currentTarget.value);
              setCounted(String(onHandOf(event.currentTarget.value)));
            }}
            error={state.fields?.sku}
          />
        )}
        <Input
          id={fieldId(PREFIX, "onHand")}
          name="onHand"
          label="Unidades en depósito"
          inputMode="numeric"
          hint={`Cantidad contada hoy${variants ? " de esa variante" : ""}. Ahora hay ${current}.`}
          aria-describedby={differenceId}
          value={counted}
          onChange={(event) => setCounted(event.currentTarget.value)}
          error={state.fields?.onHand}
        />
        <Select
          id={fieldId(PREFIX, "reason")}
          name="reason"
          label="Motivo"
          options={REASON_OPTIONS}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          error={state.fields?.reason ?? (restockDown ? "La reposición solo suma unidades. Para restar, elegí Ajuste y explicá el motivo." : undefined)}
        />
        <Input
          id={fieldId(PREFIX, "note")}
          name="note"
          label="Nota"
          required={reason === "adjustment"}
          hint="Obligatoria en ajustes."
          defaultValue={state.values?.note ?? ""}
          error={state.fields?.note}
        />
      </div>
      <p id={differenceId} className={styles.difference} aria-live="polite">
        {difference?.text ?? "Ingresá la cantidad contada para ver la diferencia."}
      </p>
      <div className={styles.saveRow}>
        <SavedMessage state={state} />
        <Button type="submit" variant="primary" loading={pending} disabled={restockDown}>
          Registrar stock
        </Button>
      </div>
    </form>
  );
}
