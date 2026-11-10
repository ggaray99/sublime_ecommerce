import type { QueryFn } from "../db/client.ts";
import type { Availability, InventoryRepository } from "./repository.ts";

type AvailabilityRow = { sku: string; track_stock: boolean; on_hand: number | null; reserved: number | null };

/**
 * Availability = on_hand − reserved for tracked variants. A tracked variant
 * without an inventory row has 0 available (never sell what was not counted);
 * untracked variants (made to order) report null.
 */
export function createPostgresInventoryRepository(sql: QueryFn): InventoryRepository {
  return {
    async getAvailability(skus) {
      const result: Availability = new Map();
      if (!skus.length) return result;
      const rows = (await sql.query(
        `SELECT v.sku, v.track_stock, i.on_hand, i.reserved
         FROM product_variants v
         LEFT JOIN inventory i ON i.variant_id = v.id
         WHERE v.sku = ANY($1::text[])`,
        [[...skus]],
      )) as AvailabilityRow[];
      for (const row of rows) {
        result.set(row.sku, row.track_stock ? Math.max(0, (row.on_hand ?? 0) - (row.reserved ?? 0)) : null);
      }
      return result;
    },
  };
}
