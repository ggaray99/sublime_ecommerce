"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

/**
 * Row selection for the admin lists. The table itself stays a server
 * component: only the checkboxes and the selection bar read this context.
 * Selection covers the rows on screen; the page gives the provider a `key`
 * per page/filter, so moving to another page or filter starts empty.
 */
type Selection = {
  ids: string[];
  selected: string[];
  isSelected: (id: string) => boolean;
  toggle: (id: string, on: boolean) => void;
  setAll: (on: boolean) => void;
  clear: () => void;
  /** Where focus goes when the bar disappears ("Quitar selección"). */
  allRef: RefObject<HTMLInputElement | null>;
};

const SelectionContext = createContext<Selection | null>(null);

export function useSelection(): Selection {
  const selection = useContext(SelectionContext);
  if (!selection) throw new Error("useSelection needs a <SelectableTable>.");
  return selection;
}

/** Wraps the selection bar and the table of one list page; `ids` are the rows shown, in order. */
export function SelectableTable({ ids, children }: { ids: string[]; children: ReactNode }) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  const allRef = useRef<HTMLInputElement>(null);
  const selection = useMemo<Selection>(() => {
    // Rows that left the page (e.g. after a refresh) drop out of the selection.
    const selected = ids.filter((id) => chosen.has(id));
    return {
      ids,
      selected,
      isSelected: (id) => chosen.has(id),
      toggle: (id, on) =>
        setChosen((current) => {
          const next = new Set(current);
          if (on) next.add(id);
          else next.delete(id);
          return next;
        }),
      setAll: (on) => setChosen(on ? new Set(ids) : new Set()),
      clear: () => {
        setChosen(new Set());
        allRef.current?.focus();
      },
      allRef,
    };
  }, [ids, chosen]);
  return <SelectionContext.Provider value={selection}>{children}</SelectionContext.Provider>;
}

/** Header cell: all rows on this page; mixed when only some are checked. */
export function SelectAllCheckbox() {
  const { ids, selected, setAll, allRef } = useSelection();
  const all = ids.length > 0 && selected.length === ids.length;
  const some = selected.length > 0 && !all;
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = some;
  }, [allRef, some]);
  return (
    <label className="admin-check">
      <input ref={allRef} type="checkbox" checked={all} aria-checked={some ? "mixed" : all} onChange={(event) => setAll(event.target.checked)} />
      <span className="visually-hidden">Seleccionar todos</span>
    </label>
  );
}

/** One row's checkbox; `label` names the row for screen readers ("Seleccionar SUB-1001"). */
export function RowCheckbox({ id, label }: { id: string; label: string }) {
  const { isSelected, toggle } = useSelection();
  return (
    <label className="admin-check">
      <input type="checkbox" checked={isSelected(id)} onChange={(event) => toggle(id, event.target.checked)} />
      <span className="visually-hidden">Seleccionar {label}</span>
    </label>
  );
}
