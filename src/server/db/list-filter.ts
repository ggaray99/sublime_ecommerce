/**
 * WHERE clause for the "newest first" lists (orders, custom requests) with only
 * the filters in use, so the planner picks the matching index: (status,
 * created_at), (customer_id, created_at) or (created_at) alone. A catch-all
 * "($1 IS NULL OR status = $1)" can hide those indexes.
 */
export function newestFirst(table: "orders" | "custom_requests", filter: { status?: string; customerId?: string; limit?: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }
  if (filter.customerId) {
    params.push(filter.customerId);
    where.push(`customer_id = $${params.length}::uuid`);
  }
  params.push(filter.limit ?? 100);
  const text = `SELECT * FROM ${table} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT $${params.length}`;
  return { text, params };
}
