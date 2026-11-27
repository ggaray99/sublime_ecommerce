"use client";

import { createContext, useActionState, useContext, useState, type ReactNode } from "react";
import { updateProductExtrasAction } from "@/app/admin/actions";
import { Button, Card, Input, Select } from "@/components/admin/ui";
import { formatPrice } from "@/lib/format";
import type { AdminFormState } from "@/server/admin/guard";
import { ErrorSummary, fieldId, SavedMessage, useSaveToast } from "./products/product-form-parts";
import styles from "./products/product-page.module.css";

export type ExtrasFormValues = {
  weightG: string;
  length: string;
  width: string;
  height: string;
  cost: string;
  lowStockThreshold: string;
  saleKind: "none" | "percent" | "price";
  salePercent: string;
  salePrice: string;
  saleStartsAt: string;
  saleEndsAt: string;
};

/** "2.500,50" → 2500.5 for the margin preview (the server parses it again). */
const pesos = (text: string) => {
  const compact = text.replace(/\s|\$/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(compact);
  return compact && Number.isFinite(value) ? value : null;
};

const FORM_ID = "product-extras-form";
const PREFIX = "extras";
const id = (key: string) => fieldId(PREFIX, key);

/** Labels in page order, for the error summary. */
const EXTRAS_LABELS: Record<string, string> = {
  cost: "Costo por unidad",
  saleKind: "Tipo de oferta",
  salePercent: "Descuento",
  salePrice: "Precio de oferta",
  saleStartsAt: "Empieza",
  saleEndsAt: "Termina",
  weightG: "Peso con empaque",
  length: "Medidas",
  width: "Ancho",
  height: "Alto",
  lowStockThreshold: "Avisar con stock en",
};

type ExtrasContext = {
  state: AdminFormState;
  pending: boolean;
  value: (key: keyof ExtrasFormValues) => string;
  priceMinor: number | null;
  hasOptions: boolean;
};

const Context = createContext<ExtrasContext | null>(null);

function useExtras(): ExtrasContext {
  const context = useContext(Context);
  if (!context) throw new Error("Extras cards need a <ProductExtrasForm>.");
  return context;
}

/**
 * The updateProductExtrasAction form ("Venta y logística"), shared by the
 * "Precio y oferta" and "Envío" cards. The <form> holds the hidden product id;
 * the controls join it with the `form` attribute, so one save sends the same
 * fields as before.
 */
export function ProductExtrasForm({
  productId,
  initial,
  priceMinor,
  hasOptions,
  children,
}: {
  productId: string;
  initial: ExtrasFormValues;
  /** Regular price of the default variant, for the margin. */
  priceMinor: number | null;
  hasOptions: boolean;
  children: ReactNode;
}) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(updateProductExtrasAction, {});
  useSaveToast(state);
  const value = (key: keyof ExtrasFormValues) => state.values?.[key] ?? initial[key];
  return (
    <Context.Provider value={{ state, pending, value, priceMinor, hasOptions }}>
      <form id={FORM_ID} action={action} noValidate>
        <input type="hidden" name="productId" value={productId} />
      </form>
      {children}
    </Context.Provider>
  );
}

function SaveExtras({ state, pending }: { state: AdminFormState; pending: boolean }) {
  return (
    <div className={styles.saveRow}>
      <SavedMessage state={state} />
      <Button type="submit" form={FORM_ID} variant="primary" loading={pending}>
        Guardar precio y envío
      </Button>
    </div>
  );
}

/** Cost, margin and sale price. */
export function ProductPricingCard() {
  const { state, pending, value, priceMinor, hasOptions } = useExtras();
  const [saleKind, setSaleKind] = useState(value("saleKind"));
  const [cost, setCost] = useState(value("cost"));
  const [salePercent, setSalePercent] = useState(value("salePercent"));
  const [salePrice, setSalePrice] = useState(value("salePrice"));
  const error = (key: string) => state.fields?.[key];

  const price = priceMinor === null ? null : priceMinor / 100;
  const salePriceValue =
    price === null ? null : saleKind === "percent" ? Math.round((price * (100 - (Number(salePercent) || 0))) / 100) : saleKind === "price" ? pesos(salePrice) : null;
  const costValue = pesos(cost);
  const margin = (sell: number | null) => (sell && costValue !== null ? Math.round(((sell - costValue) / sell) * 100) : null);

  return (
    <Card section id="precio" title="Precio y oferta" footer={<SaveExtras state={state} pending={pending} />}>
      <ErrorSummary state={state} labels={EXTRAS_LABELS} idPrefix={PREFIX} />
      <p className={styles.muted}>
        {price === null ? "Producto a pedido: se cotiza en cada encargo." : `Precio de venta: ${formatPrice(price)}. Se cambia en Datos del producto${hasOptions ? " o en cada variante" : ""}.`}
      </p>
      <div className={styles.grid2}>
        <Input
          id={id("cost")}
          form={FORM_ID}
          name="cost"
          label="Costo por unidad (ARS)"
          prefix="$"
          inputMode="decimal"
          hint="Ej.: 1.700. No se muestra en la tienda."
          value={cost}
          onChange={(event) => setCost(event.currentTarget.value)}
          error={error("cost")}
        />
        <div>
          <p className={styles.subtitle}>Margen</p>
          <p className={styles.text} aria-live="polite">
            {price === null
              ? "Se cotiza a pedido."
              : costValue === null
                ? "Cargá el costo para ver el margen."
                : `${margin(price)} % a ${formatPrice(price)}${salePriceValue !== null && salePriceValue !== price ? ` · ${margin(salePriceValue)} % en oferta (${formatPrice(salePriceValue)})` : ""}`}
          </p>
          {costValue !== null && salePriceValue !== null && salePriceValue < costValue && (
            <p className={styles.inlineError}>La oferta queda por debajo del costo.</p>
          )}
        </div>
      </div>
      {hasOptions && <p className={styles.muted}>Con variantes, este costo es el de la variante principal. El de cada talle o color se carga con la importación.</p>}

      <div className={styles.block}>
        <h3 className={styles.subtitle}>Oferta</h3>
        <div className={styles.grid2}>
          <Select
            id={id("saleKind")}
            form={FORM_ID}
            name="saleKind"
            label="Tipo"
            value={saleKind}
            onChange={(event) => setSaleKind(event.currentTarget.value as ExtrasFormValues["saleKind"])}
            error={error("saleKind")}
          >
            <option value="none">Sin oferta</option>
            <option value="percent">Porcentaje de descuento</option>
            {!hasOptions && <option value="price">Precio fijo de oferta</option>}
          </Select>
          {saleKind === "percent" && (
            <Input
              id={id("salePercent")}
              form={FORM_ID}
              name="salePercent"
              label="Descuento (%)"
              suffix="%"
              inputMode="numeric"
              hint="De 1 a 90. Ej.: 15"
              value={salePercent}
              onChange={(event) => setSalePercent(event.currentTarget.value)}
              error={error("salePercent")}
            />
          )}
          {saleKind === "price" && (
            <Input
              id={id("salePrice")}
              form={FORM_ID}
              name="salePrice"
              label="Precio de oferta (ARS)"
              prefix="$"
              inputMode="decimal"
              hint="Ej.: 1.500"
              value={salePrice}
              onChange={(event) => setSalePrice(event.currentTarget.value)}
              error={error("salePrice")}
            />
          )}
        </div>
        {saleKind !== "none" && (
          <>
            <div className={styles.grid2}>
              <Input
                id={id("saleStartsAt")}
                form={FORM_ID}
                name="saleStartsAt"
                type="datetime-local"
                label="Empieza (opcional)"
                defaultValue={value("saleStartsAt")}
                error={error("saleStartsAt")}
              />
              <Input
                id={id("saleEndsAt")}
                form={FORM_ID}
                name="saleEndsAt"
                type="datetime-local"
                label="Termina (opcional)"
                defaultValue={value("saleEndsAt")}
                error={error("saleEndsAt")}
              />
            </div>
            <p className={styles.muted}>Hora de Argentina. La tienda muestra el precio anterior tachado y la etiqueta “Oferta”.</p>
          </>
        )}
      </div>
    </Card>
  );
}

/** Weight, package size and the low-stock alert. */
export function ProductShippingCard() {
  const { state, pending, value } = useExtras();
  const error = (key: string) => state.fields?.[key];
  const input = (key: keyof ExtrasFormValues, label: string, hint?: string, inputMode: "numeric" | "decimal" = "decimal") => (
    <Input id={id(key)} form={FORM_ID} name={key} label={label} hint={hint} inputMode={inputMode} defaultValue={value(key)} error={error(key)} />
  );
  return (
    <Card section id="envio" title="Envío" footer={<SaveExtras state={state} pending={pending} />}>
      <p className={styles.muted}>Se usan para cotizar el envío. «Guardar precio y envío» guarda también Precio y oferta.</p>
      <div className={styles.grid2}>
        {input("weightG", "Peso con empaque (g)", "Ej.: 180", "numeric")}
        {input("lowStockThreshold", "Avisar con stock en", "Unidades. Vacío = el general (5).", "numeric")}
      </div>
      <div className={styles.grid3}>
        {input("length", "Largo (cm)", "Paquete armado.")}
        {input("width", "Ancho (cm)")}
        {input("height", "Alto (cm)")}
      </div>
    </Card>
  );
}
