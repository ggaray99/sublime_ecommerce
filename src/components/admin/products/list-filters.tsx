import Link from "next/link";
import { AutoSubmitForm } from "@/components/admin/auto-submit-form";
import { Button, Input, LinkTabs, Select, type SelectOption } from "@/components/admin/ui";
import { SearchIcon } from "@/components/admin/ui/icons";
import { themes } from "@/data/products";
import { hasActiveFilters, productSearchToQuery, type ProductSearch } from "@/server/admin/product-search";
import type { ProductFacets } from "@/server/admin/repository";
import { PRODUCT_STATUSES } from "@/server/admin/validation";
import styles from "./list.module.css";

const LIST = "/admin/productos";

const withCount = (label: string, count: number) => `${label} (${count})`;

const SORT_OPTIONS: SelectOption[] = [
  { value: "nombre", label: "Nombre (A-Z)" },
  { value: "precio-asc", label: "Precio: menor a mayor" },
  { value: "precio-desc", label: "Precio: mayor a menor" },
  { value: "stock-asc", label: "Stock: menor primero" },
  { value: "modificado", label: "Modificados recientemente" },
];

const STATUS_TABS: { status?: (typeof PRODUCT_STATUSES)[number]; label: string }[] = [
  { label: "Todos" },
  { status: "active", label: "Publicados" },
  { status: "draft", label: "Borradores" },
  { status: "archived", label: "Archivados" },
];

/** Tabs by status (catalog totals) that keep the other filters. */
export function ProductStatusTabs({ search, facets }: { search: ProductSearch; facets: ProductFacets }) {
  return (
    <LinkTabs
      label="Filtrar por estado"
      tabs={STATUS_TABS.map((tab) => ({
        label: tab.label,
        href: `${LIST}${productSearchToQuery(search, { status: tab.status, page: 1 })}`,
        current: search.status === tab.status,
        count: tab.status ? facets.status[tab.status] : facets.total,
      }))}
    />
  );
}

/**
 * One GET form for search, filters and order (the same URL parameters as
 * before). Selects apply on change (AutoSubmitForm); the search applies with
 * Enter or "Buscar", which also submits everything without JavaScript.
 */
export function ProductFilters({
  search,
  facets,
  categories,
}: {
  search: ProductSearch;
  facets: ProductFacets;
  categories: { value: string; label: string }[];
}) {
  return (
    <AutoSubmitForm action={LIST} className={styles.filters}>
      {/* The status comes from the tabs. */}
      {search.status && <input type="hidden" name="estado" value={search.status} />}
      <div className={styles.search}>
        <Input
          type="search"
          name="q"
          label="Buscar productos"
          labelHidden
          placeholder="Nombre, SKU, código o etiqueta"
          defaultValue={search.query}
          prefix={<SearchIcon />}
        />
        <Button type="submit">Buscar</Button>
      </div>
      <Select
        className={styles.filter}
        name="categoria"
        label="Categoría"
        defaultValue={search.categoryId ?? ""}
        placeholder="Todas"
        options={categories.map((category) => ({ value: category.value, label: withCount(category.label, facets.categories[category.value] ?? 0) }))}
      />
      <Select
        className={styles.filter}
        name="tematica"
        label="Temática"
        defaultValue={search.theme ?? ""}
        placeholder="Todas"
        options={Object.entries(themes).map(([value, label]) => ({ value, label: withCount(label, facets.themes[value] ?? 0) }))}
      />
      <Select
        className={styles.filter}
        name="stock"
        label="Stock"
        defaultValue={search.stock ?? ""}
        placeholder="Todos"
        options={[
          { value: "con", label: withCount("Con stock", facets.stock.con) },
          { value: "bajo", label: withCount("Stock bajo", facets.stock.bajo) },
          { value: "sin", label: withCount("Sin stock", facets.stock.sin) },
          { value: "pedido", label: withCount("A pedido", facets.stock.pedido) },
        ]}
      />
      <Select
        className={styles.filter}
        name="imagenes"
        label="Imágenes"
        defaultValue={search.images ?? ""}
        placeholder="Todas"
        options={[
          { value: "con", label: withCount("Con fotos", facets.images.con) },
          { value: "sin", label: withCount("Sin fotos", facets.images.sin) },
        ]}
      />
      <Select
        className={styles.filter}
        name="destacado"
        label="Destacado"
        defaultValue={search.featured ?? ""}
        placeholder="Todos"
        options={[
          { value: "si", label: withCount("Destacados", facets.featured.si) },
          { value: "no", label: withCount("No destacados", facets.featured.no) },
        ]}
      />
      <Select
        className={styles.filter}
        name="orden"
        label="Ordenar por"
        defaultValue={search.sort === "orden" ? "" : search.sort}
        placeholder="Orden de la tienda"
        options={SORT_OPTIONS}
      />
      {hasActiveFilters(search) && (
        <Link href={LIST} className={styles.clear}>
          Limpiar filtros
        </Link>
      )}
    </AutoSubmitForm>
  );
}
