import { parsePesos } from "../admin/validation.ts";
import type { QueryFn } from "../customers/repository.ts";
import { PROVINCES } from "../customers/validation.ts";
import { cityKey, DEFAULT_PICKUP, type PickupSettings, type ShippingRule, type ShippingScope } from "./rules.ts";

export type ShippingRuleInput = Omit<ShippingRule, "id">;

export class ShippingError extends Error {
  readonly code: "not_found" | "conflict";

  constructor(code: "not_found" | "conflict", message: string) {
    super(message);
    this.code = code;
  }
}

type Data = Record<string, unknown>;
const text = (data: Data, key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");
const bool = (value: unknown) => value === true || value === "on" || value === "true";
const SCOPES: ShippingScope[] = ["postal_code", "city", "province", "default"];

/** Amount in pesos from a form ("3.500") or centavos from JSON. */
function money(data: Data, pesosKey: string, minorKey: string): number | null | undefined {
  if (typeof data[minorKey] === "number") return Number.isInteger(data[minorKey]) ? (data[minorKey] as number) : undefined;
  const raw = text(data, pesosKey);
  if (!raw) return null;
  return parsePesos(raw) ?? undefined;
}

export function parseShippingRule(data: Data): { ok: true; value: ShippingRuleInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const scope = text(data, "scope") as ShippingScope;
  if (!SCOPES.includes(scope)) errors.scope = "Elegí el tipo de regla.";

  const label = text(data, "label");
  if (!label || label.length > 80) errors.label = "Poné un nombre de 1 a 80 caracteres (ej.: Gran Mendoza).";

  let province: string | null = null;
  let city: string | null = null;
  if (scope === "city" || scope === "province") {
    province = text(data, "province");
    if (!(PROVINCES as readonly string[]).includes(province)) errors.province = "Elegí una provincia.";
  }
  if (scope === "city") {
    city = text(data, "city");
    if (!city || city.length > 80) errors.city = "Escribí la localidad.";
  }

  let postalFrom: number | null = null;
  let postalTo: number | null = null;
  if (scope === "postal_code") {
    const from = text(data, "postalFrom");
    const to = text(data, "postalTo") || from;
    if (!/^\d{4}$/.test(from) || !/^\d{4}$/.test(to) || Number(from) < 1000 || Number(from) > Number(to)) {
      errors.postalFrom = "Código postal de 4 dígitos (o un rango, ej.: 5500 a 5599).";
    } else {
      postalFrom = Number(from);
      postalTo = Number(to);
    }
  }

  const available = data.available === undefined ? true : bool(data.available);
  const cost = money(data, "cost", "costMinor");
  if (available && (cost === undefined || cost === null)) errors.cost = "Indicá el costo en pesos (0 = sin cargo).";
  else if (cost === undefined || (cost !== null && cost > 100_000_000)) errors.cost = "Costo inválido.";
  const freeFrom = money(data, "freeFrom", "freeFromMinor");
  if (freeFrom === undefined || (freeFrom !== null && freeFrom <= 0)) errors.freeFrom = "Monto inválido (o dejalo vacío).";

  const etaMin = Number(text(data, "etaMinDays") || data.etaMinDays || 0);
  const etaMax = Number(text(data, "etaMaxDays") || data.etaMaxDays || etaMin);
  if (!Number.isInteger(etaMin) || !Number.isInteger(etaMax) || etaMin < 0 || etaMax > 60 || etaMin > etaMax) {
    errors.etaMinDays = "Plazo en días hábiles, de 0 a 60 (mínimo ≤ máximo).";
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      scope,
      label,
      province,
      city,
      postalFrom,
      postalTo,
      available,
      costMinor: available ? (cost ?? 0) : 0,
      freeFromMinor: available ? (freeFrom ?? null) : null,
      etaMinDays: etaMin,
      etaMaxDays: etaMax,
      active: data.active === undefined ? true : bool(data.active),
    },
  };
}

type RuleRow = {
  id: string;
  scope: ShippingScope;
  label: string;
  province: string | null;
  city: string | null;
  postal_from: number | null;
  postal_to: number | null;
  available: boolean;
  cost_minor: string | number;
  free_from_minor: string | number | null;
  eta_min_days: number;
  eta_max_days: number;
  active: boolean;
};

const toRule = (row: RuleRow): ShippingRule => ({
  id: row.id,
  scope: row.scope,
  label: row.label,
  province: row.province,
  city: row.city,
  postalFrom: row.postal_from,
  postalTo: row.postal_to,
  available: row.available,
  costMinor: Number(row.cost_minor),
  freeFromMinor: row.free_from_minor === null ? null : Number(row.free_from_minor),
  etaMinDays: row.eta_min_days,
  etaMaxDays: row.eta_max_days,
  active: row.active,
});

const SELECT_RULES = `
  SELECT id, scope, label, province, city, lower(postal_codes) AS postal_from, upper(postal_codes) - 1 AS postal_to,
         available, cost_minor, free_from_minor, eta_min_days, eta_max_days, active
  FROM shipping_rules`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Overlaps and duplicates are rejected by the database; explain them to people. */
function conflict(error: unknown): ShippingError | null {
  const code = (error as { code?: string } | null)?.code;
  if (code === "23P01") return new ShippingError("conflict", "Ese rango de códigos postales se superpone con otra regla activa.");
  if (code === "23505") return new ShippingError("conflict", "Ya hay una regla activa para esa zona. Editala o desactivala primero.");
  return null;
}

const params = (input: ShippingRuleInput) => [
  input.scope,
  input.label,
  input.province,
  input.city,
  input.city ? cityKey(input.city) : null,
  input.postalFrom,
  input.postalTo === null ? null : input.postalTo + 1,
  input.available,
  input.costMinor,
  input.freeFromMinor,
  input.etaMinDays,
  input.etaMaxDays,
  input.active,
];

const audit = "INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)";

export function createShippingRepository(sql: QueryFn) {
  return {
    async listRules(options: { activeOnly?: boolean } = {}): Promise<ShippingRule[]> {
      const rows = (await sql.query(
        `${SELECT_RULES} WHERE ($1::boolean IS NOT TRUE OR active)
         ORDER BY array_position(ARRAY['postal_code','city','province','default'], scope), province NULLS LAST, label`,
        [options.activeOnly ?? false],
      )) as RuleRow[];
      return rows.map(toRule);
    },

    async createRule(actor: { authUserId: string; email: string }, input: ShippingRuleInput): Promise<string> {
      try {
        const [row] = (await sql.query(
          `WITH created AS (
             INSERT INTO shipping_rules (scope, label, province, city, city_key, postal_codes, available, cost_minor,
                                         free_from_minor, eta_min_days, eta_max_days, active)
             VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::int IS NULL THEN NULL ELSE int4range($6::int, $7::int) END,
                     $8, $9, $10, $11, $12, $13)
             RETURNING id
           ),
           logged AS (${audit} SELECT $14, $15, 'shipping.create', 'shipping', id::text, $16::jsonb FROM created)
           SELECT id FROM created`,
          [...params(input), actor.authUserId, actor.email, JSON.stringify(input)],
        )) as { id: string }[];
        return row.id;
      } catch (error) {
        throw conflict(error) ?? error;
      }
    },

    async updateRule(actor: { authUserId: string; email: string }, id: string, input: ShippingRuleInput): Promise<void> {
      if (!UUID.test(id)) throw new ShippingError("not_found", "La regla no existe.");
      try {
        const rows = (await sql.query(
          `WITH updated AS (
             UPDATE shipping_rules SET scope = $1, label = $2, province = $3, city = $4, city_key = $5,
                    postal_codes = CASE WHEN $6::int IS NULL THEN NULL ELSE int4range($6::int, $7::int) END,
                    available = $8, cost_minor = $9, free_from_minor = $10, eta_min_days = $11, eta_max_days = $12,
                    active = $13, updated_at = now()
             WHERE id = $14 RETURNING id
           ),
           logged AS (${audit} SELECT $15, $16, 'shipping.update', 'shipping', id::text, $17::jsonb FROM updated)
           SELECT id FROM updated`,
          [...params(input), id, actor.authUserId, actor.email, JSON.stringify(input)],
        )) as { id: string }[];
        if (!rows.length) throw new ShippingError("not_found", "La regla no existe.");
      } catch (error) {
        throw conflict(error) ?? error;
      }
    },

    /** Orders keep their own copy of the quote, so deleting a rule never changes them. */
    async deleteRule(actor: { authUserId: string; email: string }, id: string): Promise<void> {
      if (!UUID.test(id)) throw new ShippingError("not_found", "La regla no existe.");
      await sql.query(
        `WITH removed AS (DELETE FROM shipping_rules WHERE id = $1 RETURNING id, label)
         ${audit} SELECT $2, $3, 'shipping.delete', 'shipping', id::text, jsonb_build_object('label', label) FROM removed`,
        [id, actor.authUserId, actor.email],
      );
    },

    async getPickup(): Promise<PickupSettings> {
      const [row] = (await sql.query("SELECT value FROM store_settings WHERE key = 'pickup'")) as { value: PickupSettings }[];
      return { ...DEFAULT_PICKUP, ...(row?.value ?? {}) };
    },

    async setPickup(actor: { authUserId: string; email: string }, settings: PickupSettings): Promise<void> {
      await sql.query(
        `WITH saved AS (
           INSERT INTO store_settings (key, value, updated_by) VALUES ('pickup', $1::jsonb, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
           RETURNING key
         )
         ${audit} SELECT $3, $2, 'shipping.pickup', 'shipping', key, $1::jsonb FROM saved`,
        [JSON.stringify(settings), actor.email, actor.authUserId],
      );
    },
  };
}

export type ShippingRepository = ReturnType<typeof createShippingRepository>;

export function parsePickup(data: Data): { ok: true; value: PickupSettings } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const value: PickupSettings = {
    enabled: bool(data.enabled),
    address: text(data, "address"),
    hours: text(data, "hours"),
    notes: text(data, "notes"),
  };
  if (value.enabled && !value.address) errors.address = "Indicá la dirección del punto de retiro.";
  if (value.address.length > 160) errors.address = "Hasta 160 caracteres.";
  if (value.hours.length > 160) errors.hours = "Hasta 160 caracteres.";
  if (value.notes.length > 300) errors.notes = "Hasta 300 caracteres.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}
