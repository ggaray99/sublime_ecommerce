import Link from "next/link";
import { AutoSubmitForm } from "@/components/admin/auto-submit-form";
import p from "@/components/admin/products/list.module.css";
import { Button, Input, Select, type SelectOption } from "@/components/admin/ui";
import { SearchIcon } from "@/components/admin/ui/icons";
import { hasActiveMovementFilters, type MovementListSearch } from "@/server/inventory/inventory-search";
import { MOVEMENT_KINDS } from "@/server/inventory/movement-view";

const LIST = "/admin/inventario/movimientos";

const KIND_OPTIONS: SelectOption[] = MOVEMENT_KINDS.map((kind) => ({ value: kind.value, label: kind.label }));

/**
 * One GET form for search, type and dates (Argentina). The type applies on
 * change (AutoSubmitForm); the search and the dates apply with Enter or
 * "Buscar", which also submits everything without JavaScript.
 */
export function MovementFilters({ search }: { search: MovementListSearch }) {
  return (
    <AutoSubmitForm action={LIST} className={p.filters}>
      <div className={p.search}>
        <Input
          type="search"
          name="q"
          label="Buscar movimientos"
          labelHidden
          placeholder="Producto o SKU"
          defaultValue={search.query}
          maxLength={60}
          prefix={<SearchIcon />}
        />
        <Button type="submit">Buscar</Button>
      </div>
      <Select className={p.filter} name="tipo" label="Tipo" defaultValue={search.kind ?? ""} placeholder="Todos" options={KIND_OPTIONS} />
      <Input className={p.filter} type="date" name="desde" label="Desde" defaultValue={search.from ?? ""} max={search.to} />
      <Input className={p.filter} type="date" name="hasta" label="Hasta" defaultValue={search.to ?? ""} min={search.from} />
      {hasActiveMovementFilters(search) && (
        <Link href={LIST} className={p.clear}>
          Limpiar filtros
        </Link>
      )}
    </AutoSubmitForm>
  );
}
