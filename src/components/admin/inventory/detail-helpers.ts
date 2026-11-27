/*
 * Pure rules of the inventory detail page and its adjustment dialog (tested in
 * tests/admin-inventory-detail.test.mjs). Display and client-side checks only:
 * the stock is written by countStockAction → countStock, which keeps the rules
 * (absolute count, note required for an adjustment, never below the reserved
 * units). Type-only imports, so the dialog does not bundle server modules.
 */
import { argentinaDateTime } from "../orders/detail-helpers.ts";

/** Options of a variant ("Talle M · Color Negro"), in the product's option order; "Única" without options. */
export function variantOptionsText(options: Record<string, string>, optionNames: readonly string[]): string {
  const names = optionNames.length ? optionNames.filter((name) => options[name]) : Object.keys(options);
  const text = names.map((name) => `${name} ${options[name]}`).join(" · ");
  return text || "Única";
}

/** "+3", "−2" (minus sign), "0". */
export const signedDelta = (delta: number): string => (delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : "0");

const units = (count: number) => `${count} ${count === 1 ? "unidad" : "unidades"}`;

export type AdjustMode = "delta" | "total";

export type AdjustInput = {
  onHand: number;
  reserved: number;
  mode: AdjustMode;
  /** What the person typed: signed units ("delta") or the new total ("total"). */
  amount: string;
  reason: string;
  note: string;
  maxStock: number;
};

export type AdjustPlan = {
  /** The absolute count that will be submitted; null while the amount is not a whole number. */
  result: number | null;
  available: number | null;
  errors: { amount?: string; note?: string };
  valid: boolean;
};

/**
 * The adjustment the dialog will submit. "Sumar o restar" turns signed units
 * into the absolute count the server expects; "Contar el total" is that count.
 * Mirrors the server checks so the person sees them before confirming.
 */
export function planAdjustment(input: AdjustInput): AdjustPlan {
  const errors: AdjustPlan["errors"] = {};
  const amount = input.amount.trim();
  let result: number | null = null;

  if (input.mode === "delta") {
    if (!amount) errors.amount = "Ingresá cuántas unidades sumar o restar.";
    else if (!/^[+-]?\d+$/.test(amount)) errors.amount = "Ingresá un número entero, por ejemplo 5 o -3.";
    else result = input.onHand + Number(amount);
  } else if (!/^\d+$/.test(amount)) {
    errors.amount = `Ingresá una cantidad entera entre 0 y ${input.maxStock}.`;
  } else {
    result = Number(amount);
  }

  if (result !== null) {
    if (result < 0) errors.amount = `El resultado no puede ser negativo: hay ${units(input.onHand)} en depósito.`;
    else if (result < input.reserved) errors.amount = `Hay ${units(input.reserved)} reservadas: el stock no puede quedar en menos de ${input.reserved}.`;
    else if (result > input.maxStock) errors.amount = `El stock puede ser de hasta ${input.maxStock} unidades.`;
  }

  const note = input.note.trim();
  if (note.length > 200) errors.note = "La nota puede tener hasta 200 caracteres.";
  else if (input.reason === "adjustment" && !note) errors.note = "Explicá el ajuste (por ejemplo: rotura, recuento).";

  return {
    result,
    available: result === null ? null : result - input.reserved,
    errors,
    valid: result !== null && !errors.amount && !errors.note,
  };
}

/** "Resultado esperado: 7 unidades en depósito (disponibles: 5)." */
export const expectedResultText = (result: number, reserved: number): string =>
  `Resultado esperado: ${units(result)} en depósito (disponibles: ${result - reserved}).`;

/** The question of the dialog's confirmation step. */
export const adjustmentConfirmText = (from: number, to: number): string => `Vas a pasar de ${from} a ${to} unidades. ¿Confirmás?`;

/** "vence dd/mm HH:MM", Argentina time. */
export function reservationExpiryText(expiresAt: Date): string {
  const [date, time] = argentinaDateTime(expiresAt).split(" ");
  return `vence ${date.slice(0, 5)} ${time}`;
}

/** Result of a count: nothing is written when it equals the current units, so say so. */
export const countResultMessage = (before: number | null, after: number): string =>
  before === after ? `Sin cambios: el stock ya era ${after}.` : "Stock actualizado.";
