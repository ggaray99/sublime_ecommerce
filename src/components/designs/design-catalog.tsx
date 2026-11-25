"use client";

import { useSearchParams } from "next/navigation";
import { useId, useMemo } from "react";
import {
  defaultDesignFilters,
  designFilterOptions,
  designFiltersToSearch,
  filterDesignCards,
  parseDesignFilters,
  type DesignFilters,
} from "@/lib/designs/catalog-filters";
import type { TemplateOverrides } from "@/lib/designs/mockups";
import { DesignGrid, type DesignCard } from "./design-grid";

/** The design catalog with its filters (product, garment color, theme), kept in the URL. */
export function DesignCatalog({ cards, overrides }: { cards: DesignCard[]; overrides: TemplateOverrides }) {
  const options = useMemo(() => designFilterOptions(cards), [cards]);
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseDesignFilters(searchParams, options), [searchParams, options]);
  const results = useMemo(() => filterDesignCards(cards, filters), [cards, filters]);
  const id = useId();

  // Native history updates keep the URL shareable without a server round trip;
  // Next.js syncs useSearchParams with replaceState.
  const update = (patch: Partial<DesignFilters>) => {
    if (window.location.pathname !== "/disenos") return;
    window.history.replaceState(null, "", `/disenos${designFiltersToSearch({ ...filters, ...patch })}`);
  };

  const active = designFiltersToSearch(filters) !== "";

  return (
    <div className="shop">
      <form className="filters" role="search" aria-label="Filtros de diseños" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <label htmlFor={`${id}-kind`}>Producto</label>
          <select id={`${id}-kind`} value={filters.kind} onChange={(event) => update({ kind: event.target.value as DesignFilters["kind"] })}>
            <option value="todos">Todos</option>
            {options.kinds.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
        </div>
        {options.colors.length > 0 && (
          <div className="field">
            <label htmlFor={`${id}-color`}>Color de la prenda</label>
            <select id={`${id}-color`} value={filters.color} onChange={(event) => update({ color: event.target.value })}>
              <option value="todos">Todos</option>
              {options.colors.map((color) => (
                <option key={color.key} value={color.key}>
                  {color.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {options.themes.length > 0 && (
          <div className="field">
            <label htmlFor={`${id}-theme`}>Temática</label>
            <select id={`${id}-theme`} value={filters.theme} onChange={(event) => update({ theme: event.target.value })}>
              <option value="todas">Todas</option>
              {options.themes.map((theme) => (
                <option key={theme.slug} value={theme.slug}>
                  {theme.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </form>

      <div className="results-bar">
        <p role="status" aria-live="polite">
          {results.length === 1 ? "1 diseño" : `${results.length} diseños`}
        </p>
        {active && (
          <button type="button" className="link-button" onClick={() => update(defaultDesignFilters)}>
            Limpiar filtros
          </button>
        )}
      </div>

      {results.length ? (
        <DesignGrid cards={results} overrides={overrides} filters={filters} />
      ) : (
        <div className="empty-state">
          <h2>No hay diseños con esos filtros.</h2>
          <p>Probá con otro producto, color o temática.</p>
          <div className="actions">
            <button type="button" className="btn btn--acid" onClick={() => update(defaultDesignFilters)}>
              Ver todos los diseños
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
