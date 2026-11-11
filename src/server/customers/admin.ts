import type { QueryFn } from "../db/client.ts";

/**
 * Admin → Clientes. Starts from auth_users, so everyone who signed up appears, also before
 * their customers row exists (it is created the first time they open Mi cuenta).
 */
export type CustomerSummary = {
  authUserId: string;
  /** customers.id; null until they open Mi cuenta. Orders and requests hang from it. */
  customerId: string | null;
  name: string;
  email: string;
  phone: string | null;
  isAdmin: boolean;
  createdAt: Date;
  /** Last session activity (sign-in or session refresh); null when there is no session left. */
  lastSeenAt: Date | null;
  orderCount: number;
  /** Paid, shipped or delivered orders, and what they add up to (with shipping, minus discounts). */
  paidOrderCount: number;
  spentMinor: number;
  lastOrderAt: Date | null;
  requestCount: number;
};

type Row = {
  auth_user_id: string;
  customer_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  is_admin: boolean;
  created_at: Date | string;
  last_seen_at: Date | string | null;
  order_count: number | string;
  paid_order_count: number | string;
  spent_minor: number | string;
  last_order_at: Date | string | null;
  request_count: number | string;
};

const date = (value: Date | string | null) => (value === null ? null : new Date(value));

const toSummary = (row: Row): CustomerSummary => ({
  authUserId: row.auth_user_id,
  customerId: row.customer_id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  isAdmin: row.is_admin,
  createdAt: new Date(row.created_at),
  lastSeenAt: date(row.last_seen_at),
  orderCount: Number(row.order_count),
  paidOrderCount: Number(row.paid_order_count),
  spentMinor: Number(row.spent_minor),
  lastOrderAt: date(row.last_order_at),
  requestCount: Number(row.request_count),
});

const PAID = "('paid', 'shipped', 'fulfilled')";

const SELECT = `
  SELECT u.id AS auth_user_id, c.id AS customer_id, COALESCE(NULLIF(c.full_name, ''), u.name) AS name, u.email, c.phone,
         EXISTS (SELECT 1 FROM admin_users a WHERE a.auth_user_id = u.id) AS is_admin,
         u.created_at,
         (SELECT max(s.updated_at) FROM auth_sessions s WHERE s.user_id = u.id) AS last_seen_at,
         COALESCE(o.order_count, 0) AS order_count, COALESCE(o.paid_order_count, 0) AS paid_order_count,
         COALESCE(o.spent_minor, 0) AS spent_minor, o.last_order_at,
         (SELECT count(*) FROM custom_requests r WHERE r.customer_id = c.id) AS request_count
  FROM auth_users u
  LEFT JOIN customers c ON c.auth_user_id = u.id
  LEFT JOIN LATERAL (
    SELECT count(*) AS order_count,
           count(*) FILTER (WHERE status IN ${PAID}) AS paid_order_count,
           COALESCE(sum(subtotal_minor - discount_minor + COALESCE(shipping_minor, 0)) FILTER (WHERE status IN ${PAID}), 0) AS spent_minor,
           max(created_at) AS last_order_at
    FROM orders WHERE customer_id = c.id
  ) o ON true`;

/** ILIKE pattern that takes % and _ (and the escape itself) literally. */
const containsPattern = (text: string) => `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

export function createCustomerAdminRepository(sql: QueryFn) {
  return {
    async list(filter: { search?: string; limit?: number } = {}): Promise<CustomerSummary[]> {
      const search = (filter.search ?? "").trim().slice(0, 100);
      const rows = (await sql.query(
        `${SELECT}
         WHERE $1 = '' OR u.email ILIKE $2 OR u.name ILIKE $2 OR c.full_name ILIKE $2 OR c.phone ILIKE $2
         ORDER BY u.created_at DESC, u.id
         LIMIT $3`,
        [search, containsPattern(search), Math.min(Math.max(filter.limit ?? 200, 1), 500)],
      )) as Row[];
      return rows.map(toSummary);
    },

    async count(): Promise<number> {
      const [row] = (await sql.query("SELECT count(*) AS n FROM auth_users")) as { n: number | string }[];
      return Number(row.n);
    },

    /** By account id, or by customers.id (what orders and requests point to). */
    async get(id: string): Promise<CustomerSummary | null> {
      const [row] = (await sql.query(`${SELECT} WHERE u.id = $1 OR c.id::text = $1`, [id])) as Row[];
      return row ? toSummary(row) : null;
    },
  };
}

export type CustomerAdminRepository = ReturnType<typeof createCustomerAdminRepository>;
