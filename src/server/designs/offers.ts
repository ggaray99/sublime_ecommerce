import { MOCKUP_KINDS, type MockupKind } from "../../lib/designs/kinds.ts";
import type { QueryFn } from "../customers/repository.ts";
import { colorKey, variantColor } from "../../lib/designs/mockups.ts";
import { BASES_JSON, designLineName, offerableBases, type OfferedBaseRow } from "./repository.ts";

/**
 * A published design and the storefront products (legacy ids) it can be bought on
 * right now. `colors` are the color keys enabled on each (null/undefined = every
 * color); `variantColors` maps a SKU of the base product to its color key
 * (variants without a Color option are missing).
 */
export type DesignOffer = {
  id: string;
  name: string;
  bases: { kind: MockupKind; productId: string; colors?: string[] | null; variantColors?: Record<string, string> }[];
};

/** What the cart quote needs to accept a design line; injected like the catalog. */
export interface DesignOfferRepository {
  findOffers(designIds: readonly string[]): Promise<Map<string, DesignOffer>>;
}

export { designLineName };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** SKU → color key of the variants that have a Color option. */
function skuColors(variants: Record<string, Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(variants).flatMap(([sku, options]) => {
      const color = variantColor(options);
      return color ? [[sku, colorKey(color)]] : [];
    }),
  );
}

/** Whether a SKU of the base can carry the design: its color is enabled, or it has none. */
export function offersSku(base: DesignOffer["bases"][number], sku: string): boolean {
  const color = base.variantColors?.[sku];
  return !color || !base.colors || base.colors.includes(color);
}

/** The static catalog has no designs: every design line is rejected. */
export const noDesignOffers: DesignOfferRepository = {
  async findOffers() {
    return new Map();
  },
};

/**
 * Same rules as the store listing (listStorefrontDesigns): published, in a visible
 * category, on kinds whose base product is active in a visible category and has an
 * active variant in a color enabled for the design.
 */
export function createPostgresDesignOffers(sql: QueryFn): DesignOfferRepository {
  return {
    async findOffers(designIds) {
      const ids = [...new Set(designIds)].filter((id) => UUID.test(id));
      if (!ids.length) return new Map();
      const rows = (await sql.query(
        `SELECT d.id, d.name,
                ${BASES_JSON} AS bases,
                (SELECT json_object_agg(m2.kind, (SELECT json_object_agg(v.sku, v.options) FROM product_variants v WHERE v.product_id = m2.product_id))
                 FROM mockup_bases m2 WHERE m2.kind IN (SELECT kind FROM design_bases WHERE design_id = d.id)) AS skus
         FROM designs d
         LEFT JOIN categories c ON c.id = d.category_id
         JOIN design_bases b ON b.design_id = d.id
         JOIN mockup_bases m ON m.kind = b.kind
         JOIN products p ON p.id = m.product_id AND p.status = 'active' AND p.legacy_id IS NOT NULL
         JOIN categories pc ON pc.id = p.category_id AND pc.active
         WHERE d.id = ANY($2::uuid[]) AND d.status = 'published' AND (d.category_id IS NULL OR c.active)
         GROUP BY d.id`,
        [[...MOCKUP_KINDS], ids],
      )) as { id: string; name: string; bases: OfferedBaseRow[]; skus: Partial<Record<MockupKind, Record<string, Record<string, string>> | null>> }[];
      return new Map(
        rows.flatMap((row) => {
          // A base without active variants stays: the quote then reports the product itself
          // as unavailable (unknown_product), as it did before colors existed.
          const bases = row.bases.filter((base) => !base.variants?.length || offerableBases([base]).length).map(({ kind, productId, colors }) => ({
            kind,
            productId,
            colors,
            variantColors: skuColors(row.skus[kind] ?? {}),
          }));
          return bases.length ? [[row.id, { id: row.id, name: row.name, bases }] as const] : [];
        }),
      );
    },
  };
}
