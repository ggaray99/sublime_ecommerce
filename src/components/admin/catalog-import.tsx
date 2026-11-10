"use client";

import { useActionState } from "react";
import { importCatalogAction, type ImportState } from "@/app/admin/productos/importar/actions";

const RESULT_LABEL = { created: "Nuevo", updated: "Cambia", unchanged: "Igual", failed: "Error" } as const;

export function CatalogImport() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importCatalogAction, {});
  const report = state.report;
  const canApply = report?.dryRun && report.summary.created + report.summary.updated > 0;

  return (
    <div className="quote-form">
      <form action={action} className="quote-form" noValidate>
        <div className="field">
          <label htmlFor="import-file">Archivo CSV</label>
          <input id="import-file" name="file" type="file" accept=".csv,text/csv" required />
        </div>
        <button type="submit" className="btn btn--coal" disabled={pending}>
          {pending ? "Revisando…" : "Revisar planilla"}
        </button>
      </form>

      {state.error && (
        <p className="form-alert" role="alert">
          {state.error}
        </p>
      )}

      {report && (
        <section aria-labelledby="import-result" className="import-report">
          <h3 id="import-result" className="account__subtitle">
            {report.dryRun ? `Vista previa de ${state.fileName}: todavía no se cambió nada` : "Planilla aplicada"}
          </h3>
          <p role="status">
            {report.summary.created} nuevos · {report.summary.updated} con cambios · {report.summary.unchanged} sin cambios ·{" "}
            {report.summary.failed} con errores
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Fila</th>
                  <th scope="col">SKU</th>
                  <th scope="col">Resultado</th>
                  <th scope="col">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {report.lines.map((line) => (
                  <tr key={line.row} className={line.result === "unchanged" ? "is-inactive" : undefined}>
                    <td>{line.row}</td>
                    <td>{line.sku || "—"}</td>
                    <td>
                      <span className={`badge ${line.result === "failed" ? "badge--sale" : line.result === "unchanged" ? "badge--pending" : "badge--ok"}`}>
                        {RESULT_LABEL[line.result]}
                      </span>
                    </td>
                    <td>{line.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canApply && (
            <form action={action}>
              <input type="hidden" name="apply" value="1" />
              <input type="hidden" name="text" value={state.text ?? ""} />
              <input type="hidden" name="fileName" value={state.fileName ?? ""} />
              <button type="submit" className="btn btn--acid" disabled={pending}>
                {pending ? "Aplicando…" : `Aplicar ${report.summary.created + report.summary.updated} cambios`}
              </button>
              {report.summary.failed > 0 && <p className="muted">Las filas con error se saltean; corregilas y volvé a subir la planilla.</p>}
            </form>
          )}
        </section>
      )}
    </div>
  );
}
