"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/admin/ui";
import { useSelection } from "./selectable-table";

/**
 * Bar above a selectable table. It always keeps its place (a fixed height),
 * so checking the first row never moves the table under the pointer: with
 * nothing checked it shows `idleHint`; with rows checked, the count, the
 * actions (`children`, which read the ids with useSelection()) and "Quitar
 * selección". `hint` is a note about the selection shown in both states.
 */
export function SelectionBar({
  hint,
  idleHint = "Seleccioná filas para ver las acciones",
  children,
}: {
  hint?: string;
  idleHint?: string;
  children: ReactNode;
}) {
  const { selected, clear } = useSelection();
  const count = selected.length;
  const summary = `${count} ${count === 1 ? "seleccionado" : "seleccionados"}`;
  return (
    <>
      {/* Always mounted, so screen readers hear each change. */}
      <p className="visually-hidden" role="status">
        {count ? summary : ""}
      </p>
      <div
        className={count ? "admin-selection-bar is-active" : "admin-selection-bar"}
        // A group of actions only while there are actions.
        {...(count ? { role: "group", "aria-label": "Acciones sobre la selección" } : {})}
      >
        {count > 0 ? (
          <>
            <strong className="admin-selection-bar__count">{summary}</strong>
            <div className="admin-selection-bar__actions">
              {children}
              <Button variant="tertiary" size="sm" onClick={clear}>
                Quitar selección
              </Button>
            </div>
          </>
        ) : (
          <p className="admin-selection-bar__idle">{idleHint}</p>
        )}
        {hint && <p className="admin-selection-bar__hint">{hint}</p>}
      </div>
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
      <Button size="sm" onClick={download} loading={busy}>
        {busy ? "Exportando…" : "Exportar seleccionados (CSV)"}
      </Button>
      {error && (
        <span className="admin-selection-bar__error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
