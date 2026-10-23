/**
 * Money is stored and computed as integer minor units (centavos) with an
 * explicit ISO 4217 currency. Never use floating point amounts on the server.
 */
export type Currency = "ARS";

export const DEFAULT_CURRENCY: Currency = "ARS";

export type Money = { amountMinor: number; currency: Currency };

/** Converts a whole-peso amount from the legacy static catalog to centavos. */
export function pesosToMinor(pesos: number): number {
  if (!Number.isFinite(pesos) || pesos < 0) throw new RangeError(`Invalid peso amount: ${pesos}`);
  return Math.round(pesos * 100);
}

export function multiplyMinor(amountMinor: number, quantity: number): number {
  const result = amountMinor * quantity;
  if (!Number.isSafeInteger(result)) throw new RangeError("Amount overflow");
  return result;
}
