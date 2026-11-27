import Link from "next/link";
import { AutoSubmitForm } from "@/components/admin/auto-submit-form";
import p from "@/components/admin/products/list.module.css";
import { Button, Input, LinkTabs, Select, type SelectOption, VisuallyHidden } from "@/components/admin/ui";
import { SearchIcon } from "@/components/admin/ui/icons";
import { orderStatusLabel } from "@/components/orders/order-view";
import { hasActiveOrderFilters, orderSearchToQuery, type OrderSearch } from "@/server/orders/order-search";
import type { OrderStatus } from "@/server/orders/repository";
import { DELIVERY_FILTERS, PAYMENT_FILTERS } from "@/server/orders/status-view";
import s from "./list.module.css";

const LIST = "/admin/pedidos";

const SORT_OPTIONS: SelectOption[] = [
  { value: "antiguos", label: "Más antiguos" },
  { value: "total-desc", label: "Total: mayor a menor" },
  { value: "total-asc", label: "Total: menor a mayor" },
];

/** The views that need attention; each is an existing "Pago" or "Entrega" filter. */
const TABS: { label: string; payment?: string; delivery?: string; count: (counts: OrderTabCounts) => number }[] = [
  { label: "Todos", count: (counts) => counts.total },
  { label: "Por cobrar", payment: "pendiente", count: (counts) => counts.byStatus.pending_payment },
  { label: "Sin enviar", delivery: "sin-enviar", count: (counts) => counts.toDeliver.shipping },
  { label: "Para retirar", delivery: "para-retirar", count: (counts) => counts.toDeliver.pickup },
  { label: "En revisión", payment: "revision", count: (counts) => counts.byStatus.needs_review },
];

export type OrderTabCounts = {
  total: number;
  byStatus: Record<OrderStatus, number>;
  toDeliver: { shipping: number; pickup: number };
};

/** Tabs by what needs doing (store totals). They keep the search, dates and order. */
export function OrderTabs({ search, counts }: { search: OrderSearch; counts: OrderTabCounts }) {
  return (
    <LinkTabs
      label="Vistas de pedidos"
      tabs={TABS.map((tab) => ({
        label: tab.label,
        href: `${LIST}${orderSearchToQuery(search, { status: undefined, payment: tab.payment, delivery: tab.delivery, page: 1 })}`,
        current: !search.status && search.payment === tab.payment && search.delivery === tab.delivery,
        count: tab.count(counts),
      }))}
    />
  );
}

/** The exact status from a link like Inicio's (?estado=paid), with a way to drop it. */
export function OrderStatusFilter({ search }: { search: OrderSearch }) {
  if (!search.status) return null;
  return (
    <p className={s.activeFilter}>
      <span>
        Estado: <strong>{orderStatusLabel[search.status]}</strong>
      </span>
      <Link href={`${LIST}${orderSearchToQuery(search, { status: undefined, page: 1 })}`} className={p.clear}>
        Quitar<VisuallyHidden> el filtro de estado</VisuallyHidden>
      </Link>
    </p>
  );
}

/**
 * One GET form for search, filters, dates and order. Selects apply on change
 * (AutoSubmitForm); the search and the dates apply with Enter or "Buscar",
 * which also submits everything without JavaScript.
 */
export function OrderFilters({ search }: { search: OrderSearch }) {
  return (
    <AutoSubmitForm action={LIST} className={p.filters}>
      {/* The exact status comes from links (Inicio); it stays until removed. */}
      {search.status && <input type="hidden" name="estado" value={search.status} />}
      <div className={p.search}>
        <Input
          type="search"
          name="q"
          label="Buscar pedidos"
          labelHidden
          placeholder="Número (SUB-1010), nombre o email"
          defaultValue={search.query}
          prefix={<SearchIcon />}
        />
        <Button type="submit">Buscar</Button>
      </div>
      <Select
        className={p.filter}
        name="pago"
        label="Pago"
        defaultValue={search.payment ?? ""}
        placeholder="Todos"
        options={PAYMENT_FILTERS.map((filter) => ({ value: filter.value, label: filter.label }))}
      />
      <Select
        className={p.filter}
        name="entrega"
        label="Entrega"
        defaultValue={search.delivery ?? ""}
        placeholder="Todas"
        options={DELIVERY_FILTERS.map((filter) => ({ value: filter.value, label: filter.label }))}
      />
      <Input className={p.filter} type="date" name="desde" label="Desde" defaultValue={search.from ?? ""} max={search.to} />
      <Input className={p.filter} type="date" name="hasta" label="Hasta" defaultValue={search.to ?? ""} min={search.from} />
      <Select
        className={p.filter}
        name="orden"
        label="Ordenar por"
        defaultValue={search.sort === "recientes" ? "" : search.sort}
        placeholder="Más recientes"
        options={SORT_OPTIONS}
      />
      {hasActiveOrderFilters(search) && (
        <Link href={LIST} className={p.clear}>
          Limpiar filtros
        </Link>
      )}
    </AutoSubmitForm>
  );
}
