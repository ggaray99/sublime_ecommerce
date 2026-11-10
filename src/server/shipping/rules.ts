/**
 * Shipping quote rules (pure: shared by the checkout preview in the browser,
 * the server checkout and the admin simulator).
 *
 * Precedence: postal code > city > province > default. The most specific
 * matching rule decides, including "no coverage" (available = false).
 */

export type ShippingScope = "postal_code" | "city" | "province" | "default";

export type ShippingRule = {
  id: string;
  scope: ShippingScope;
  label: string;
  province: string | null;
  city: string | null;
  /** Inclusive range of the numeric postal code (5500–5599). */
  postalFrom: number | null;
  postalTo: number | null;
  available: boolean;
  costMinor: number;
  freeFromMinor: number | null;
  etaMinDays: number;
  etaMaxDays: number;
  active: boolean;
};

export type ShippingAddress = { province: string; city: string; postalCode: string };

export type ShippingQuote =
  | {
      covered: true;
      ruleId: string;
      label: string;
      scope: ShippingScope;
      costMinor: number;
      /** Free because the subtotal reached the rule's threshold. */
      free: boolean;
      baseCostMinor: number;
      etaMinDays: number;
      etaMaxDays: number;
    }
  | { covered: false; ruleId: string | null; label: string | null; reason: string };

const PRECEDENCE: ShippingScope[] = ["postal_code", "city", "province", "default"];

/** "San Martín " → "san martin" (case and accents never break a match). */
export const cityKey = (city: string) =>
  city
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Numeric part of an Argentine postal code: "M5500ABC" → 5500, "5500" → 5500. */
export function postalNumber(postalCode: string): number | null {
  const match = /^(?:[A-Z])?(\d{4})(?:[A-Z]{3})?$/.exec(postalCode.replace(/\s+/g, "").toUpperCase());
  return match ? Number(match[1]) : null;
}

function matches(rule: ShippingRule, address: ShippingAddress, postal: number | null): boolean {
  switch (rule.scope) {
    case "postal_code":
      return postal !== null && rule.postalFrom !== null && rule.postalTo !== null && postal >= rule.postalFrom && postal <= rule.postalTo;
    case "city":
      return rule.province === address.province && cityKey(rule.city ?? "") === cityKey(address.city);
    case "province":
      return rule.province === address.province;
    default:
      return true;
  }
}

/** The rule that decides for this address (active rules only), or null. */
export function findRule(rules: readonly ShippingRule[], address: ShippingAddress): ShippingRule | null {
  const postal = postalNumber(address.postalCode);
  for (const scope of PRECEDENCE) {
    const rule = rules.find((candidate) => candidate.active && candidate.scope === scope && matches(candidate, address, postal));
    if (rule) return rule;
  }
  return null;
}

export function quoteShipping(rules: readonly ShippingRule[], address: ShippingAddress, subtotalMinor: number): ShippingQuote {
  const rule = findRule(rules, address);
  if (!rule) return { covered: false, ruleId: null, label: null, reason: "Por ahora no hacemos envíos a esa zona. Podés elegir retiro." };
  if (!rule.available) return { covered: false, ruleId: rule.id, label: rule.label, reason: `${rule.label}: por ahora no hacemos envíos a esa zona.` };
  const free = rule.freeFromMinor !== null && subtotalMinor >= rule.freeFromMinor;
  return {
    covered: true,
    ruleId: rule.id,
    label: rule.label,
    scope: rule.scope,
    costMinor: free ? 0 : rule.costMinor,
    free,
    baseCostMinor: rule.costMinor,
    etaMinDays: rule.etaMinDays,
    etaMaxDays: rule.etaMaxDays,
  };
}

/** "2 a 4 días hábiles", "1 día hábil", "en el día". */
export function etaLabel(min: number, max: number): string {
  if (max === 0) return "en el día";
  if (min === max) return `${max} ${max === 1 ? "día hábil" : "días hábiles"}`;
  return `${min} a ${max} días hábiles`;
}

export const SCOPE_LABEL: Record<ShippingScope, string> = {
  postal_code: "Código postal",
  city: "Localidad",
  province: "Provincia",
  default: "Resto del país",
};

export type PickupSettings = { enabled: boolean; address: string; hours: string; notes: string };
export const DEFAULT_PICKUP: PickupSettings = { enabled: true, address: "", hours: "", notes: "" };
