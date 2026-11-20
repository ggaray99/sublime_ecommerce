import { MOCKUP_KINDS, type MockupKind } from "../../lib/designs/kinds.ts";
import type { QueryFn } from "../customers/repository.ts";
import { designLineName } from "./repository.ts";

/** A published design and the storefront products (legacy ids) it can be bought on right now. */
export type DesignOffer = { id: string; name: string; bases: { kind: MockupKind; productId: string }[] };

/** What the cart quote needs to accept a design line; injected like the catalog. */
export interface DesignOfferRepository {
  findOffers(designIds: readonly string[]): Promise<Map<string, DesignOffer>>;
}

export { designLineName };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The static catalog has no designs: every design line is rejected. */
export const noDesignOffers: DesignOfferRepository = {
  async findOffers() {
    return new Map();
  },
};

/**
 * Same rules as the store listing (listStorefrontDesigns): published, in a visible
 * category, on kinds whose base product is active in a visible category.
 */
export function createPostgresDesignOffers(sql: QueryFn): DesignOfferRepository {
  return {
    async findOffers(designIds) {
      const ids = [...new Set(designIds)].filter((id) => UUID.test(id));
      if (!ids.length) return new Map();
      const rows = (await sql.query(
        `SELECT d.id, d.name,
                json_agg(json_build_object('kind', b.kind, 'productId', p.legacy_id) ORDER BY array_position($1::text[], b.kind)) AS bases
         FROM designs d
         LEFT JOIN categories c ON c.id = d.category_id
         JOIN design_bases b ON b.design_id = d.id
         JOIN mockup_bases m ON m.kind = b.kind
         JOIN products p ON p.id = m.product_id AND p.status = 'active' AND p.legacy_id IS NOT NULL
         JOIN categories pc ON pc.id = p.category_id AND pc.active
         WHERE d.id = ANY($2::uuid[]) AND d.status = 'published' AND (d.category_id IS NULL OR c.active)
         GROUP BY d.id`,
        [[...MOCKUP_KINDS], ids],
      )) as DesignOffer[];
      return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name, bases: row.bases }]));
    },
  };
}
