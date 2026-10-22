/**
 * Formats an ARS amount as `$ 2.500`.
 * Implemented by hand so the server and the browser always render the same
 * string (Intl output can vary between ICU builds and cause hydration noise).
 */
export function formatPrice(value: number): string {
  const rounded = Math.round(Math.abs(value));
  const digits = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${value < 0 ? "-" : ""}$ ${digits}`;
}

export function priceLabel(price: number | null): string {
  return price === null ? "A presupuestar" : formatPrice(price);
}
