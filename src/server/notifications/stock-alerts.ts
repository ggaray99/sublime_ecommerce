import type { QueryFn } from "../db/client.ts";
import { LOW_STOCK } from "../admin/product-search.ts";

/**
 * Queues one "stock.low" notification with every active product that dropped
 * to its threshold (its own, or the general one) since the last alert. Stock
 * back above the threshold re-arms the alert. Runs with the outbox processor.
 */
export async function enqueueLowStock(sql: QueryFn): Promise<number> {
  const [row] = (await sql.query(
    `WITH stock AS (
       SELECT i.variant_id, i.on_hand - i.reserved AS available, coalesce(p.low_stock_threshold, $1::int) AS threshold,
              i.low_alerted_at, p.legacy_id, p.name, v.sku
       FROM inventory i
       JOIN product_variants v ON v.id = i.variant_id AND v.track_stock AND v.active
       JOIN products p ON p.id = v.product_id AND p.status = 'active'
     ),
     rearmed AS (
       UPDATE inventory i SET low_alerted_at = NULL FROM stock s
       WHERE i.variant_id = s.variant_id AND s.low_alerted_at IS NOT NULL AND s.available > s.threshold
     ),
     low AS (
       UPDATE inventory i SET low_alerted_at = now() FROM stock s
       WHERE i.variant_id = s.variant_id AND s.low_alerted_at IS NULL AND s.available <= s.threshold
       RETURNING s.legacy_id, s.name, s.sku, s.available, s.threshold
     ),
     queued AS (
       INSERT INTO notification_outbox (kind, payload)
       SELECT 'stock.low', jsonb_build_object('items', jsonb_agg(jsonb_build_object(
                'productId', legacy_id, 'name', name, 'sku', sku, 'available', available, 'threshold', threshold) ORDER BY available, name))
       FROM low HAVING count(*) > 0
       RETURNING id
     )
     SELECT (SELECT count(*) FROM low)::int AS n`,
    [LOW_STOCK],
  )) as { n: number }[];
  return row?.n ?? 0;
}
