import type { QueryFn } from "../db/client.ts";
import { argentinaDayEnd, argentinaDayStart, CUSTOMER_PAGE_SIZE, type CustomerSearch, type CustomerSort, type CustomerType } from "./customer-search.ts";

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

export type CustomerSearchResult = {
  items: CustomerSummary[];
  /** Accounts that match every filter (not the whole table). */
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

/** Over the columns of SELECT (wrapped as `x`); ties end newest first, then by id. */
const SORT_SQL: Record<CustomerSort, string> = {
  recientes: "x.created_at DESC, x.auth_user_id",
  antiguos: "x.created_at ASC, x.auth_user_id",
  // The name the list shows: the name, or the email when there is none.
  nombre: "lower(COALESCE(NULLIF(x.name, ''), x.email)), x.auth_user_id",
  "total-desc": "x.spent_minor DESC, x.created_at DESC, x.auth_user_id",
  "ultimo-pedido": "x.last_order_at DESC NULLS LAST, x.created_at DESC, x.auth_user_id",
};

/** Over the tables of SELECT (u, c). "Pagados" uses the same statuses as the total. */
const TYPE_SQL: Record<CustomerType, string> = {
  "con-pedidos-pagados": `EXISTS (SELECT 1 FROM orders po WHERE po.customer_id = c.id AND po.status IN ${PAID})`,
  "sin-pedidos": "NOT EXISTS (SELECT 1 FROM orders po WHERE po.customer_id = c.id)",
  "con-encargos": "EXISTS (SELECT 1 FROM custom_requests r WHERE r.customer_id = c.id)",
  admins: "EXISTS (SELECT 1 FROM admin_users a WHERE a.auth_user_id = u.id)",
};

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

    /**
     * The admin list: every filter combined (AND), one page of CUSTOMER_PAGE_SIZE
     * and the number of matches. Read-only; list, count and get stay as they are.
     */
    async search(search: CustomerSearch): Promise<CustomerSearchResult> {
      const where: string[] = [];
      const params: unknown[] = [];
      const param = (value: unknown) => {
        params.push(value);
        return `$${params.length}`;
      };
      if (search.query) {
        const pattern = param(containsPattern(search.query));
        where.push(`(${["u.email", "u.name", "c.full_name", "c.phone"].map((column) => `${column} ILIKE ${pattern} ESCAPE '\\'`).join(" OR ")})`);
      }
      if (search.type) where.push(TYPE_SQL[search.type]);
      // Sign-up dates are Argentina days; "hasta" includes its whole day.
      if (search.from) where.push(`u.created_at >= ${param(argentinaDayStart(search.from))}::timestamptz`);
      if (search.to) where.push(`u.created_at < ${param(argentinaDayEnd(search.to))}::timestamptz`);

      const matches = `${SELECT}${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`;
      const [{ n: total }] = (await sql.query(`SELECT count(*)::int AS n FROM (${matches}) x`, params)) as { n: number | string }[];
      const pageSize = CUSTOMER_PAGE_SIZE;
      const pages = Math.max(1, Math.ceil(Number(total) / pageSize));
      const page = Math.min(Math.max(search.page, 1), pages);
      const rows = (await sql.query(
        `SELECT * FROM (${matches}) x ORDER BY ${SORT_SQL[search.sort]} LIMIT $${params.length + 1}::int OFFSET $${params.length + 2}::int`,
        [...params, pageSize, (page - 1) * pageSize],
      )) as Row[];
      return { items: rows.map(toSummary), total: Number(total), page, pageSize, pages };
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
