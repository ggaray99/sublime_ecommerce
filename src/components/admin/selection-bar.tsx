"use client";

import { useState, type ReactNode } from "react";
import { useSelection } from "./selectable-table";

/**
 * Bar above a selectable table, shown while rows are checked. `children` are
 * the actions on the selection (export today; bulk changes can be added the
 * same way, reading the ids with useSelection()).
 */
export function SelectionBar({ hint, children }: { hint?: string; children: ReactNode }) {
  const { selected, clear } = useSelection();
  const count = selected.length;
  const summary = `${count} ${count === 1 ? "seleccionado" : "seleccionados"}`;
  return (
    <>
      {/* Always mounted, so screen readers hear each change. */}
      <p className="visually-hidden" role="status">
        {count ? summary : ""}
      </p>
      {count > 0 && (
        <div className="admin-selection-bar" role="group" aria-label="Acciones sobre la selección">
          <strong className="admin-selection-bar__count">{summary}</strong>
          <div className="admin-selection-bar__actions">
            {children}
            <button type="button" className="link-button" onClick={clear}>
              Quitar selección
            </button>
          </div>
          {hint && <p className="admin-selection-bar__hint muted">{hint}</p>}
        </div>
      )}
    </>
  );
}

/** Downloads the checked rows as CSV from `endpoint` (POST { ids }, admin-only). */
export function ExportSelectedButton({ endpoint }: { endpoint: string }) {
  const { selected } = useSelection();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected }),
      });
      if (!response.ok) {
        setError(response.status === 400 ? await response.text() : "No pudimos exportar la selección. Probá de nuevo.");
        return;
      }
      // blob(), not text(): keeps the BOM so Excel reads the accents.
      const file = await response.blob();
      const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "seleccion.csv";
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("No pudimos exportar la selección. Revisá la conexión y probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn--coal" onClick={download} disabled={busy} aria-busy={busy}>
        {busy ? "Exportando…" : "Exportar seleccionados (CSV)"}
      </button>
      {error && (
        <span className="admin-selection-bar__error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
