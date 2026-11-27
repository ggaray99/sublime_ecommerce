import Link from "next/link";
import { AutoSubmitForm } from "@/components/admin/auto-submit-form";
import p from "@/components/admin/products/list.module.css";
import { Button, Input, Select, type SelectOption } from "@/components/admin/ui";
import { SearchIcon } from "@/components/admin/ui/icons";
import { hasActiveInventoryFilters, type InventorySearch } from "@/server/inventory/inventory-search";

const LIST = "/admin/inventario";

/** Same labels and rule as the products list stock filter. */
const STATE_OPTIONS: SelectOption[] = [
  { value: "sin", label: "Sin stock" },
  { value: "bajo", label: "Stock bajo" },
  { value: "con", label: "Con stock (incluye stock bajo)" },
];

const SORT_OPTIONS: SelectOption[] = [
  { value: "disponible-asc", label: "Disponible: menor primero" },
  { value: "disponible-desc", label: "Disponible: mayor primero" },
  { value: "reservado-desc", label: "Reservado: mayor primero" },
  { value: "sku", label: "SKU (A-Z)" },
];

/**
 * One GET form for search, stock state, category, reservations, inactive
 * variants and order. Selects apply on change (AutoSubmitForm); the search
 * applies with Enter or "Buscar", which also submits everything without JavaScript.
 */
export function InventoryFilters({ search, categories }: { search: InventorySearch; categories: SelectOption[] }) {
  return (
    <AutoSubmitForm action={LIST} className={p.filters}>
      <div className={p.search}>
        <Input
          type="search"
          name="q"
          label="Buscar en el inventario"
          labelHidden
          placeholder="Producto o SKU"
          defaultValue={search.query}
          maxLength={60}
          prefix={<SearchIcon />}
        />
        <Button type="submit">Buscar</Button>
      </div>
      <Select className={p.filter} name="estado" label="Estado" defaultValue={search.state ?? ""} placeholder="Todos" options={STATE_OPTIONS} />
      <Select
        className={p.filter}
        name="categoria"
        label="Categoría"
        defaultValue={search.categoryId ?? ""}
        placeholder="Todas"
        options={categories}
      />
      <Select
        className={p.filter}
        name="reservado"
        label="Reservas"
        defaultValue={search.reserved ?? ""}
        placeholder="Todas las variantes"
        options={[{ value: "con-reservas", label: "Con unidades reservadas" }]}
      />
      <Select
        className={p.filter}
        name="activas"
        label="Variantes"
        defaultValue={search.inactive ?? ""}
        placeholder="Solo activas"
        options={[{ value: "todas", label: "Activas e inactivas" }]}
      />
      <Select
        className={p.filter}
        name="orden"
        label="Ordenar por"
        defaultValue={search.sort === "producto" ? "" : search.sort}
        placeholder="Producto (A-Z)"
        options={SORT_OPTIONS}
      />
      {hasActiveInventoryFilters(search) && (
        <Link href={LIST} className={p.clear}>
          Limpiar filtros
        </Link>
      )}
    </AutoSubmitForm>
  );
}
