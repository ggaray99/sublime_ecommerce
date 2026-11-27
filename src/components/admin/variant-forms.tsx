"use client";

import { useActionState, useId } from "react";
import { configureOptionsAction, updateVariantAction } from "@/app/admin/actions";
import { Badge, Button, Input } from "@/components/admin/ui";
import { ErrorSummary, fieldId, SavedMessage, useSaveToast } from "./products/product-form-parts";
import styles from "./products/product-page.module.css";

type OptionsInitial = { option1Name: string; option1Values: string; option2Name: string; option2Values: string };

const OPTION_LABELS: Record<string, string> = {
  option1Name: "Opción 1",
  option1Values: "Valores de la opción 1",
  option2Name: "Opción 2",
  option2Values: "Valores de la opción 2",
};

/** Defines the options; saving creates the missing combinations and deactivates removed ones. */
export function OptionsForm({ productId, initial, hasOptions }: { productId: string; initial: OptionsInitial; hasOptions: boolean }) {
  const [state, action, pending] = useActionState(configureOptionsAction, {});
  useSaveToast(state);
  const value = (key: keyof OptionsInitial) => state.values?.[key] ?? initial[key];
  const prefix = "options";
  const field = (key: keyof OptionsInitial, label: string, hint: string) => (
    <Input id={fieldId(prefix, key)} name={key} label={label} hint={hint} defaultValue={value(key)} error={state.fields?.[key]} />
  );
  return (
    <form action={action} noValidate className={styles.grid2Stack}>
      <ErrorSummary state={state} labels={OPTION_LABELS} idPrefix={prefix} />
      <input type="hidden" name="productId" value={productId} />
      <div className={styles.grid2}>
        {field("option1Name", "Opción 1", "Ej.: Talle")}
        {field("option1Values", "Valores", "Separados por coma: S, M, L, XL")}
        {field("option2Name", "Opción 2 (opcional)", "Ej.: Color")}
        {field("option2Values", "Valores", "Ej.: Negro, Blanco")}
      </div>
      <p className={styles.muted}>
        Se crea una variante por combinación, con el precio actual y stock 0. Quitar un valor desactiva sus variantes (no se
        borran).
      </p>
      <div className={styles.saveRow}>
        <SavedMessage state={state} />
        <Button type="submit" loading={pending}>
          {hasOptions ? "Actualizar variantes" : "Crear variantes"}
        </Button>
      </div>
    </form>
  );
}

type VariantRowProps = {
  productId: string;
  variantId: string;
  label: string;
  sku: string;
  stock: string;
  price: string;
  active: boolean;
  priced: boolean;
};

/**
 * One table row: price and visibility of one combination, saved on its own.
 * The <form> sits in the last cell; the price and "Activa" controls join it
 * with the `form` attribute (a form cannot wrap table cells).
 */
export function VariantRow({ productId, variantId, label, sku, stock, price, active, priced }: VariantRowProps) {
  const [state, action, pending] = useActionState(updateVariantAction, {});
  useSaveToast(state);
  const formId = useId();
  const priceId = useId();
  const activeId = useId();
  const isActive = state.values ? state.values.active === "on" : active;
  return (
    <tr className={active ? undefined : styles.inactive}>
      <th scope="row">
        {label} {!active && <Badge>Inactiva</Badge>}
      </th>
      <td className={styles.numeric}>{sku}</td>
      <td className={styles.numeric}>{stock}</td>
      <td className={styles.priceCell}>
        {priced ? (
          <Input
            id={priceId}
            form={formId}
            name="price"
            label={`Precio de ${label}`}
            labelHidden
            prefix="$"
            inputMode="decimal"
            defaultValue={state.values?.price ?? price}
            error={state.fields?.price}
          />
        ) : (
          <>
            <input type="hidden" form={formId} name="price" value="" />
            <span className={styles.muted}>A pedido</span>
          </>
        )}
      </td>
      <td>
        <input id={activeId} form={formId} name="active" type="checkbox" defaultChecked={isActive} aria-label={`${label} activa`} />
      </td>
      <td>
        <form id={formId} action={action} noValidate className={styles.saveRow}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="variantId" value={variantId} />
          <Button type="submit" size="sm" loading={pending} aria-label={`Guardar ${label}`}>
            Guardar
          </Button>
          <SavedMessage state={state} />
          {state.error && (
            <span className={styles.inlineError} role="alert">
              {state.error}
            </span>
          )}
        </form>
      </td>
    </tr>
  );
}
