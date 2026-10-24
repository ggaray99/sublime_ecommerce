"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Category } from "@/data/categories";
import { themes, type Product } from "@/data/products";
import {
  defaultFilters,
  filterProducts,
  filtersToSearch,
  parseFilters,
  sortOptions,
  typeOptions,
  type CatalogFilters,
} from "@/lib/catalog";
import { ProductCard } from "./product-card";


/** `products` and `categories` come from the server (database where connected). */
export function Shop({ products, categories }: { products: Product[]; categories: Category[] }) {
  const valid = useMemo(() => ({ categories: categories.map((category) => category.id), themes: Object.keys(themes) }), [categories]);
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseFilters(searchParams, valid), [searchParams, valid]);
  const id = useId();

  // The search box keeps a local draft so typing never waits for the URL.
  // When the URL query changes from elsewhere (links, back button), adopt it.
  const [draft, setDraft] = useState(filters.query);
  const [urlQuery, setUrlQuery] = useState(filters.query);
  if (filters.query !== urlQuery) {
    setUrlQuery(filters.query);
    setDraft(filters.query);
  }

  const view = useMemo(() => ({ ...filters, query: draft }), [filters, draft]);
  const results = useMemo(() => filterProducts(products, view), [products, view]);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const pending = timer;
    return () => clearTimeout(pending.current);
  }, []);

  // Native history updates keep the URL shareable without a server round trip;
  // Next.js syncs useSearchParams with replaceState. Reading the live URL avoids
  // stale closures when the debounced search write lands after another change.
  const writeUrl = (patch: Partial<CatalogFilters>) => {
    if (window.location.pathname !== "/tienda") return;
    const current = parseFilters(new URLSearchParams(window.location.search), valid);
    window.history.replaceState(null, "", `/tienda${filtersToSearch({ ...current, ...patch })}`);
  };

  const update = (patch: Partial<CatalogFilters>) => {
    if (patch.query !== undefined) {
      clearTimeout(timer.current);
      setDraft(patch.query);
    }
    writeUrl(patch);
  };

  const onQueryChange = (value: string) => {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => writeUrl({ query: value }), 300);
  };

  const active = filtersToSearch({ ...view, sort: defaultFilters.sort }) !== "";

  return (
    <div className="shop">
      <div className="category-chips" role="group" aria-label="Filtrar por categoría">
        <button type="button" aria-pressed={filters.category === "todas"} onClick={() => update({ category: "todas" })}>
          Todo
        </button>
        {categories.map((category) => (
          <button
            type="button"
            key={category.id}
            aria-pressed={filters.category === category.id}
            onClick={() => update({ category: category.id })}
          >
            {category.label}
          </button>
        ))}
      </div>

      <form className="filters" role="search" aria-label="Filtros del catálogo" onSubmit={(event) => event.preventDefault()}>
        <div className="field field--search">
          <label htmlFor={`${id}-q`}>Buscar</label>
          <input
            id={`${id}-q`}
            type="search"
            value={draft}
            placeholder="Nombre, etiqueta o código: flores, mate, 088…"
            onChange={(event) => onQueryChange(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-category`}>Categoría</label>
          <select
            id={`${id}-category`}
            value={filters.category}
            onChange={(event) => update({ category: event.target.value as CatalogFilters["category"] })}
          >
            <option value="todas">Todas</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-type`}>Tipo de producto</label>
          <select
            id={`${id}-type`}
            value={filters.type}
            onChange={(event) => update({ type: event.target.value as CatalogFilters["type"] })}
          >
            <option value="todos">Todos</option>
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-theme`}>Temática</label>
          <select
            id={`${id}-theme`}
            value={filters.theme}
            onChange={(event) => update({ theme: event.target.value as CatalogFilters["theme"] })}
          >
            <option value="todas">Todas</option>
            {Object.entries(themes).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-sort`}>Ordenar por</label>
          <select
            id={`${id}-sort`}
            value={filters.sort}
            onChange={(event) => update({ sort: event.target.value as CatalogFilters["sort"] })}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </form>

      <div className="results-bar">
        <p role="status" aria-live="polite">
          {results.length === 1 ? "1 producto" : `${results.length} productos`}
        </p>
        {active && (
          <button type="button" className="link-button" onClick={() => update({ ...defaultFilters, sort: filters.sort })}>
            Limpiar filtros
          </button>
        )}
      </div>

      {results.length ? (
        <ul className="product-grid">
          {results.map((product, index) => (
            <li key={product.id}>
              <ProductCard product={product} headingLevel="h2" preload={index < 2} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <h2>No encontramos coincidencias.</h2>
          <p>Probá con otra palabra o quitá algún filtro. Si no existe lo que buscás, pedinos un encargo a medida.</p>
          <div className="actions">
            <button type="button" className="btn btn--acid" onClick={() => update(defaultFilters)}>
              Ver todo el catálogo
            </button>
            <Link className="btn btn--ghost" href="/encargos">
              Pedir un personalizado
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
