import type { QueryFn } from "../db/client.ts";
import { argentinaDateTime } from "../admin/product-extras.ts";
import { parsePesos } from "../admin/validation.ts";
import { normalizeCoupon, PROMOTION_KINDS, type Promotion, type PromotionKind, type PromotionParams, type PromotionScope } from "../../lib/promotions.ts";

export type PromotionInput = Omit<Promotion, "id" | "usesCount">;

type Data = Record<string, unknown>;
const text = (data: Data, key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");
const list = (data: Data, key: string) =>
  text(data, key)
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);

function intIn(raw: string, min: number, max: number): number | null | undefined {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

/** Up to this many rows for tiers and bundle items in the admin form. */
export const FORM_ROWS = 3;

/**
 * Validates the admin form. Category ids come as a comma-separated list (checkboxes
 * joined by the form), products as public ids ("taza-kiss, remera-pop").
 */
export function parsePromotion(data: Data): { ok: true; value: PromotionInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = text(data, "name");
  if (name.length < 2 || name.length > 80) errors.name = "Un nombre de 2 a 80 caracteres.";
  const kind = text(data, "kind") as PromotionKind;
  if (!(kind in PROMOTION_KINDS)) errors.kind = "Elegí el tipo de promoción.";

  let scope = (text(data, "scope") || "all") as PromotionScope;
  if (!["all", "categories", "products"].includes(scope)) errors.scope = "Elegí a qué se aplica.";
  const categoryIds = scope === "categories" ? list(data, "categoryIds") : [];
  const productIds = scope === "products" ? list(data, "productIds").map((id) => id.toLowerCase()) : [];
  if (scope === "categories" && !categoryIds.length) errors.scope = "Elegí al menos una categoría.";
  if (scope === "products" && (!productIds.length || productIds.some((id) => !/^[a-z0-9-]{1,40}$/.test(id)))) {
    errors.productIds = "Los códigos de producto, separados por coma (por ejemplo taza-kiss).";
  }

  const params: PromotionParams = {};
  const percent = (key: string, max = 90) => {
    const value = intIn(text(data, key), 1, max);
    if (!value) errors[key] = `Un porcentaje de 1 a ${max}.`;
    return value ?? undefined;
  };
  if (kind === "percent") params.percent = percent("percent");
  if (kind === "payment_method") {
    params.percent = percent("percent", 50);
    params.method = "transfer";
  }
  if (kind === "fixed") {
    const amount = parsePesos(text(data, "amount"));
    if (!amount || amount <= 0) errors.amount = "Un monto en pesos, por ejemplo 2.000.";
    else params.amountMinor = amount;
  }
  if (kind === "quantity_tiers") {
    const tiers: NonNullable<PromotionParams["tiers"]> = [];
    for (let row = 1; row <= FORM_ROWS; row++) {
      const min = text(data, `tierMin${row}`);
      const pct = text(data, `tierPercent${row}`);
      if (!min && !pct) continue;
      const minQuantity = intIn(min, 2, 9999);
      const value = intIn(pct, 1, 90);
      if (!minQuantity || !value) errors[`tierMin${row}`] = "Desde 2 unidades y un porcentaje de 1 a 90.";
      else tiers.push({ minQuantity, percent: value });
    }
    if (!tiers.length && !errors.tierMin1) errors.tierMin1 = "Cargá al menos una escala.";
    if (new Set(tiers.map((tier) => tier.minQuantity)).size !== tiers.length) errors.tierMin1 = "Cada escala con una cantidad distinta.";
    params.tiers = tiers.sort((a, b) => a.minQuantity - b.minQuantity);
  }
  if (kind === "buy_x_pay_y") {
    const buy = intIn(text(data, "buy"), 2, 20);
    const pay = intIn(text(data, "pay"), 1, 19);
    if (!buy || !pay || pay >= buy) errors.buy = "Llevá más de lo que pagás (por ejemplo 3 y 2).";
    else Object.assign(params, { buy, pay });
  }
  if (kind === "bundle") {
    const items: NonNullable<PromotionParams["items"]> = [];
    for (let row = 1; row <= FORM_ROWS; row++) {
      const productId = text(data, `bundleProduct${row}`).toLowerCase();
      if (!productId) continue;
      const quantity = intIn(text(data, `bundleQuantity${row}`) || "1", 1, 20);
      if (!/^[a-z0-9-]{1,40}$/.test(productId) || !quantity) errors[`bundleProduct${row}`] = "Código de producto y cantidad (1 a 20).";
      else items.push({ productId, quantity });
    }
    if (items.length < 2 && !errors.bundleProduct1) errors.bundleProduct1 = "Un combo lleva al menos dos productos.";
    if (new Set(items.map((item) => item.productId)).size !== items.length) errors.bundleProduct1 = "Cada producto una sola vez.";
    const price = parsePesos(text(data, "bundlePrice"));
    if (!price || price <= 0) errors.bundlePrice = "El precio del combo en pesos.";
    params.items = items;
    if (price) params.priceMinor = price;
    // A combo names its own products: scope does not apply.
    scope = "all";
  }

  const rawCoupon = text(data, "couponCode");
  const couponCode = rawCoupon ? normalizeCoupon(rawCoupon) : null;
  if (couponCode && !/^[A-Z0-9-]{3,30}$/.test(couponCode)) errors.couponCode = "De 3 a 30 letras, números o guiones.";
  if (couponCode && kind === "payment_method") errors.couponCode = "El descuento por medio de pago es automático: dejá el cupón vacío.";

  const minRaw = text(data, "minSubtotal");
  const minSubtotalMinor = minRaw ? parsePesos(minRaw) : 0;
  if (minSubtotalMinor === null) errors.minSubtotal = "Un monto en pesos, o vacío.";
  const startsAt = argentinaDateTime(text(data, "startsAt"));
  const endsAt = argentinaDateTime(text(data, "endsAt"));
  if (startsAt === undefined) errors.startsAt = "Fecha y hora inválidas.";
  if (endsAt === undefined) errors.endsAt = "Fecha y hora inválidas.";
  if (startsAt && endsAt && endsAt <= startsAt) errors.endsAt = "Tiene que terminar después de empezar.";
  const maxUses = intIn(text(data, "maxUses"), 1, 1_000_000);
  if (maxUses === undefined) errors.maxUses = "Un número de usos, o vacío para ilimitado.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      kind,
      scope,
      categoryIds,
      productIds,
      params,
      couponCode,
      minSubtotalMinor: minSubtotalMinor ?? 0,
      startsAt: startsAt ?? null,
      endsAt: endsAt ?? null,
      maxUses: maxUses ?? null,
      active: data.active === "on" || data.active === "true" || data.active === true,
    },
  };
}

type Row = {
  id: string;
  name: string;
  kind: PromotionKind;
  scope: PromotionScope;
  category_ids: string[];
  product_ids: string[];
  params: PromotionParams;
  coupon_code: string | null;
  min_subtotal_minor: string | number;
  starts_at: Date | null;
  ends_at: Date | null;
  max_uses: number | null;
  uses_count: number;
  active: boolean;
};

const toPromotion = (row: Row): Promotion => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  scope: row.scope,
  categoryIds: row.category_ids,
  productIds: row.product_ids,
  params: row.params,
  couponCode: row.coupon_code,
  minSubtotalMinor: Number(row.min_subtotal_minor),
  startsAt: row.starts_at ? new Date(row.starts_at) : null,
  endsAt: row.ends_at ? new Date(row.ends_at) : null,
  maxUses: row.max_uses,
  usesCount: row.uses_count,
  active: row.active,
});

export class PromotionError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Actor = { authUserId: string; email: string };

export function createPromotionRepository(sql: QueryFn) {
  const audit = (action: string) =>
    `logged AS (
       INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
       SELECT $1, $2, '${action}', 'promotion', saved.id::text, $3::jsonb FROM saved
     )`;

  return {
    async list(): Promise<Promotion[]> {
      const rows = (await sql.query("SELECT * FROM promotions ORDER BY active DESC, created_at DESC")) as Row[];
      return rows.map(toPromotion);
    },

    /** Active promotions for the cart and checkout; the engine checks dates and limits. */
    async listActive(): Promise<Promotion[]> {
      const rows = (await sql.query("SELECT * FROM promotions WHERE active ORDER BY created_at")) as Row[];
      return rows.map(toPromotion);
    },

    async get(id: string): Promise<Promotion | null> {
      if (!UUID.test(id)) return null;
      const [row] = (await sql.query("SELECT * FROM promotions WHERE id = $1", [id])) as Row[];
      return row ? toPromotion(row) : null;
    },

    /** Creates (id null) or updates a promotion, with its audit entry. Returns the id. */
    async save(actor: Actor, id: string | null, input: PromotionInput): Promise<string> {
      const values = [
        input.name,
        input.kind,
        input.scope,
        input.categoryIds,
        input.productIds,
        JSON.stringify(input.params),
        input.couponCode,
        input.minSubtotalMinor,
        input.startsAt,
        input.endsAt,
        input.maxUses,
        input.active,
      ];
      try {
        const [row] = (await sql.query(
          id
            ? `WITH saved AS (
                 UPDATE promotions SET name = $4, kind = $5, scope = $6, category_ids = $7, product_ids = $8, params = $9::jsonb,
                        coupon_code = $10, min_subtotal_minor = $11, starts_at = $12, ends_at = $13, max_uses = $14, active = $15,
                        updated_at = now()
                 WHERE id = $16 RETURNING id
               ), ${audit("promotion.update")}
               SELECT id FROM saved`
            : `WITH saved AS (
                 INSERT INTO promotions (name, kind, scope, category_ids, product_ids, params, coupon_code, min_subtotal_minor,
                                         starts_at, ends_at, max_uses, active)
                 VALUES ($4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15) RETURNING id
               ), ${audit("promotion.create")}
               SELECT id FROM saved`,
          [actor.authUserId, actor.email, JSON.stringify(input), ...values, ...(id ? [id] : [])],
        )) as { id: string }[];
        if (!row) throw new PromotionError("form", "La promoción no existe.");
        return row.id;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "23505") throw new PromotionError("couponCode", "Ya hay otra promoción con ese cupón.");
        if (code === "23514" && (error as { constraint?: string }).constraint === "promotions_uses_limit") {
          throw new PromotionError("maxUses", "Ya se usó más veces que ese límite.");
        }
        throw error;
      }
    },

    async setActive(actor: Actor, id: string, active: boolean): Promise<boolean> {
      const rows = (await sql.query(
        `WITH saved AS (UPDATE promotions SET active = $4, updated_at = now() WHERE id = $5 RETURNING id), ${audit(active ? "promotion.activate" : "promotion.deactivate")}
         SELECT id FROM saved`,
        [actor.authUserId, actor.email, JSON.stringify({ active }), active, id],
      )) as { id: string }[];
      return rows.length > 0;
    },

    /** Only promotions nobody used yet; used ones are deactivated instead (orders keep their copy anyway). */
    async remove(actor: Actor, id: string): Promise<boolean> {
      const rows = (await sql.query(
        `WITH saved AS (
           DELETE FROM promotions WHERE id = $4 AND uses_count = 0
             AND NOT EXISTS (SELECT 1 FROM promotion_redemptions r WHERE r.promotion_id = $4)
           RETURNING id, name
         ), ${audit("promotion.delete")}
         SELECT id FROM saved`,
        [actor.authUserId, actor.email, JSON.stringify({ deleted: true }), id],
      )) as { id: string }[];
      return rows.length > 0;
    },
  };
}

export type PromotionRepository = ReturnType<typeof createPromotionRepository>;
