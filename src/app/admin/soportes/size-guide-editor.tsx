"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Status } from "@/components/admin/forms";
import type { AdminFormState } from "@/server/admin/guard";
import { deleteSizeGuideAction, saveSizeGuideAction } from "./size-guide-actions";

type Table = { headers: string[]; rows: string[][]; note: string };

type Props = {
  kind: string;
  label: string;
  /** The saved guide, or null when the kind has none yet. */
  guide: Table | null;
  /** Headers the editor starts with when there is no guide. */
  exampleHeaders: string[];
  limits: { columns: number; rows: number; cell: number; note: number };
};

const emptyRow = (width: number) => Array.from({ length: width }, () => "");

const startingTable = (guide: Table | null, exampleHeaders: string[]): Table =>
  guide ?? { headers: [...exampleHeaders], rows: [emptyRow(exampleHeaders.length)], note: "" };

/** Editable size-guide grid of one kind: headers, rows and a note, saved as a whole. */
export function SizeGuideEditor({ kind, label, guide, exampleHeaders, limits }: Props) {
  const id = useId();
  const [table, setTable] = useState(() => startingTable(guide, exampleHeaders));
  // Where the keyboard focus goes after adding or removing a column or a row.
  const pendingFocus = useRef<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [saveState, save, saving] = useActionState(saveSizeGuideAction, {});
  const [removeState, remove, removing] = useActionState(async (previous: AdminFormState, form: FormData) => {
    const result = await deleteSizeGuideAction(previous, form);
    if (result.ok) setTable(startingTable(null, exampleHeaders));
    return result;
  }, {});

  useEffect(() => {
    if (!pendingFocus.current) return;
    grid.current?.querySelector<HTMLElement>(`[data-focus="${pendingFocus.current}"]`)?.focus();
    pendingFocus.current = null;
  });
  const setFocus = (target: string) => {
    pendingFocus.current = target;
  };

  const { headers, rows, note } = table;
  const setHeader = (column: number, value: string) => setTable({ ...table, headers: headers.map((header, index) => (index === column ? value : header)) });
  const setCell = (row: number, column: number, value: string) =>
    setTable({ ...table, rows: rows.map((cells, r) => (r === row ? cells.map((cell, c) => (c === column ? value : cell)) : cells)) });
  const addColumn = () => {
    setTable({ ...table, headers: [...headers, ""], rows: rows.map((cells) => [...cells, ""]) });
    setFocus(`h${headers.length}`);
  };
  const removeColumn = (column: number) => {
    setTable({ ...table, headers: headers.filter((_, index) => index !== column), rows: rows.map((cells) => cells.filter((_, index) => index !== column)) });
    setFocus("add-column");
  };
  const addRow = () => {
    setTable({ ...table, rows: [...rows, emptyRow(headers.length)] });
    setFocus(`r${rows.length}c0`);
  };
  const removeRow = (row: number) => {
    setTable({ ...table, rows: rows.filter((_, index) => index !== row) });
    setFocus("add-row");
  };
  const columnName = (column: number) => headers[column]?.trim() || `Columna ${column + 1}`;

  return (
    <div className="size-guide-editor" ref={grid}>
      <form action={save} className="quote-form">
        <Status state={saveState} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="table" value={JSON.stringify({ headers, rows })} />
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="visually-hidden">Guía de talles de {label.toLowerCase()} (editable)</caption>
            <thead>
              <tr>
                {headers.map((header, column) => (
                  <th key={column} scope="col">
                    <input
                      type="text"
                      value={header}
                      maxLength={limits.cell}
                      aria-label={`Título de la columna ${column + 1}`}
                      data-focus={`h${column}`}
                      onChange={(event) => setHeader(column, event.target.value)}
                    />
                    <button type="button" className="btn btn--ghost" disabled={headers.length <= 1} onClick={() => removeColumn(column)}>
                      Quitar columna<span className="visually-hidden"> {columnName(column)}</span>
                    </button>
                  </th>
                ))}
                <th scope="col">
                  <span className="visually-hidden">Acciones de la fila</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((cells, row) => (
                <tr key={row}>
                  {cells.map((cell, column) => (
                    <td key={column}>
                      <input
                        type="text"
                        value={cell}
                        maxLength={limits.cell}
                        aria-label={`Fila ${row + 1}, ${columnName(column)}`}
                        data-focus={`r${row}c${column}`}
                        onChange={(event) => setCell(row, column, event.target.value)}
                      />
                    </td>
                  ))}
                  <td>
                    <button type="button" className="btn btn--ghost" disabled={rows.length <= 1} onClick={() => removeRow(row)}>
                      Quitar fila<span className="visually-hidden"> {row + 1}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="actions">
          <button type="button" className="btn btn--ghost" data-focus="add-column" disabled={headers.length >= limits.columns} onClick={addColumn}>
            Agregar columna
          </button>
          <button type="button" className="btn btn--ghost" data-focus="add-row" disabled={rows.length >= limits.rows} onClick={addRow}>
            Agregar fila
          </button>
        </p>
        <p className="field__hint">
          Hasta {limits.columns} columnas y {limits.rows} filas. Las filas vacías no se guardan.
        </p>
        <div className="field">
          <label htmlFor={`${id}-note`}>Nota (opcional)</label>
          <textarea
            id={`${id}-note`}
            name="note"
            rows={2}
            maxLength={limits.note}
            value={note}
            placeholder="Por ejemplo: medidas de la prenda en centímetros, tomadas en plano."
            onChange={(event) => setTable({ ...table, note: event.target.value })}
          />
        </div>
        <p className="actions">
          <button type="submit" className="btn btn--coal" disabled={saving}>
            {saving ? "Guardando…" : "Guardar guía"}
          </button>
        </p>
      </form>
      {guide && (
        <form action={remove}>
          <Status state={removeState} />
          <input type="hidden" name="kind" value={kind} />
          <button type="submit" className="btn btn--ghost" disabled={removing}>
            Quitar guía
          </button>
        </form>
      )}
      {!guide && removeState.ok && <Status state={removeState} />}
    </div>
  );
}
