import type { QueryFn } from "../customers/repository.ts";
import { createCustomRequestRepository, type RequestStatus } from "../custom-requests/repository.ts";
import { createOrderRepository, type OrderStatus } from "../orders/repository.ts";
import { createAdminRepository, type AuditEntry } from "./repository.ts";

/**
 * Admin dashboard (/admin/inicio): what needs attention today, from the same
 * repository queries the lists use, so every count matches the filtered list
 * it links to. Sales metrics are not computed anywhere yet: the page shows
 * them as unavailable instead of inventing numbers.
 */

export const RECENT_ACTIVITY = 5;

export type AttentionTone = "attention" | "warning" | "critical" | "info";

export type AttentionItem = {
  label: string;
  description: string;
  count: number;
  href: string;
  tone: AttentionTone;
};

export type AttentionGroup = {
  id: "orders" | "requests" | "stock";
  title: string;
  listHref: string;
  listLabel: string;
  emptyMessage: string;
  /** Only the items with something to do (count > 0). */
  items: AttentionItem[];
};

export type AttentionCounts = {
  orders: Record<OrderStatus, number>;
  requests: Record<RequestStatus, number>;
  /** Same definition as the products list's ?stock=sin and ?stock=bajo. */
  stock: { sin: number; bajo: number };
};

export type DashboardData = { attention: AttentionGroup[]; recent: AuditEntry[] };

/** Builds the "Para atender" groups from the status counts. */
export function attentionGroups(counts: AttentionCounts): AttentionGroup[] {
  const groups: (Omit<AttentionGroup, "items"> & { items: AttentionItem[] })[] = [
    {
      id: "orders",
      title: "Pedidos",
      listHref: "/admin/pedidos",
      listLabel: "Ver pedidos",
      emptyMessage: "No hay pedidos para atender",
      items: [
        {
          label: "Pendientes de pago",
          description: "Esperan que se confirme el pago.",
          count: counts.orders.pending_payment,
          href: "/admin/pedidos?estado=pending_payment",
          tone: "attention",
        },
        {
          label: "En revisión",
          description: "Necesitan que alguien los revise.",
          count: counts.orders.needs_review,
          href: "/admin/pedidos?estado=needs_review",
          tone: "warning",
        },
        {
          label: "Pago confirmado, sin enviar",
          description: "Listos para preparar y enviar.",
          count: counts.orders.paid,
          href: "/admin/pedidos?estado=paid",
          tone: "info",
        },
      ],
    },
    {
      id: "requests",
      title: "Encargos",
      listHref: "/admin/encargos",
      listLabel: "Ver encargos",
      emptyMessage: "No hay encargos para atender",
      items: [
        {
          label: "Recibidos sin presupuesto",
          description: "Esperan un presupuesto.",
          count: counts.requests.received,
          href: "/admin/encargos?estado=received",
          tone: "attention",
        },
      ],
    },
    {
      id: "stock",
      title: "Stock",
      listHref: "/admin",
      listLabel: "Ver productos",
      emptyMessage: "No hay productos sin stock ni con stock bajo",
      items: [
        {
          label: "Sin stock",
          description: "Productos con control de stock y nada disponible.",
          count: counts.stock.sin,
          href: "/admin?stock=sin",
          tone: "critical",
        },
        {
          label: "Stock bajo",
          description: "Quedan pocas unidades disponibles.",
          count: counts.stock.bajo,
          href: "/admin?stock=bajo",
          tone: "warning",
        },
      ],
    },
  ];
  return groups.map((group) => ({ ...group, items: group.items.filter((item) => item.count > 0) }));
}

/** Loads the dashboard: status counts, stock facets and the latest activity. */
export async function loadDashboard(sql: QueryFn): Promise<DashboardData> {
  const orders = createOrderRepository(sql);
  const admin = createAdminRepository(sql);
  // Same as the orders list: due reservations are released on read (no scheduled job),
  // so "Pendientes de pago" does not count orders that already expired.
  await orders.releaseExpired();
  const [orderCounts, requestCounts, facets, recent] = await Promise.all([
    orders.countByStatus(),
    createCustomRequestRepository(sql).countByStatus(),
    admin.productFacets(),
    admin.listAudit({ limit: RECENT_ACTIVITY }),
  ]);
  return {
    attention: attentionGroups({ orders: orderCounts, requests: requestCounts, stock: { sin: facets.stock.sin, bajo: facets.stock.bajo } }),
    recent,
  };
}
