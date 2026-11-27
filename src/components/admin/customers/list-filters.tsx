import Link from "next/link";
import { AutoSubmitForm } from "@/components/admin/auto-submit-form";
import p from "@/components/admin/products/list.module.css";
import { Button, Input, Select, type SelectOption } from "@/components/admin/ui";
import { SearchIcon } from "@/components/admin/ui/icons";
import { hasActiveCustomerFilters, type CustomerSearch, type CustomerType } from "@/server/customers/customer-search";

const LIST = "/admin/clientes";

const TYPE_LABELS: Record<CustomerType, string> = {
  "con-pedidos-pagados": "Con pedidos pagados",
  "sin-pedidos": "Sin pedidos",
  "con-encargos": "Con encargos",
  admins: "Administradores",
};

const TYPE_OPTIONS: SelectOption[] = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }));

const SORT_OPTIONS: SelectOption[] = [
  { value: "antiguos", label: "Más antiguos" },
  { value: "nombre", label: "Nombre (A-Z)" },
  { value: "total-desc", label: "Total pagado: mayor a menor" },
  { value: "ultimo-pedido", label: "Último pedido" },
];

/**
 * One GET form for search, type, sign-up dates and order. Selects apply on
 * change (AutoSubmitForm); the search and the dates apply with Enter or
 * "Buscar", which also submits everything without JavaScript.
 */
export function CustomerFilters({ search }: { search: CustomerSearch }) {
  return (
    <AutoSubmitForm action={LIST} className={p.filters}>
      <div className={p.search}>
        <Input
          type="search"
          name="q"
          label="Buscar clientes"
          labelHidden
          placeholder="Nombre, email o teléfono"
          defaultValue={search.query}
          maxLength={100}
          prefix={<SearchIcon />}
        />
        <Button type="submit">Buscar</Button>
      </div>
      <Select className={p.filter} name="tipo" label="Mostrar" defaultValue={search.type ?? ""} placeholder="Todos" options={TYPE_OPTIONS} />
      <Input className={p.filter} type="date" name="desde" label="Alta desde" defaultValue={search.from ?? ""} max={search.to} />
      <Input className={p.filter} type="date" name="hasta" label="Alta hasta" defaultValue={search.to ?? ""} min={search.from} />
      <Select
        className={p.filter}
        name="orden"
        label="Ordenar por"
        defaultValue={search.sort === "recientes" ? "" : search.sort}
        placeholder="Más recientes"
        options={SORT_OPTIONS}
      />
      {hasActiveCustomerFilters(search) && (
        <Link href={LIST} className={p.clear}>
          Limpiar filtros
        </Link>
      )}
    </AutoSubmitForm>
  );
}
