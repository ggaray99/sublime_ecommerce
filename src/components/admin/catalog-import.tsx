"use client";

import { useActionState, useEffect, useRef } from "react";
import { importCatalogAction, type ImportState } from "@/app/admin/productos/importar/actions";
import { Badge, Button, Card, DataTable, Input, useToast, type BadgeTone, type DataTableColumn } from "@/components/admin/ui";
import type { ImportLine } from "@/server/admin/csv";
import { importReview } from "./products/product-page-helpers";
import styles from "./products/product-page.module.css";

const RESULT: Record<ImportLine["result"], { label: string; tone: BadgeTone }> = {
  created: { label: "Nuevo", tone: "info" },
  updated: { label: "Cambia", tone: "success" },
  unchanged: { label: "Igual", tone: "neutral" },
  failed: { label: "Error", tone: "critical" },
};

const COLUMNS: DataTableColumn<ImportLine>[] = [
  { key: "row", header: "Fila", cell: (line) => line.row, align: "end", width: "64px" },
  { key: "sku", header: "SKU", cell: (line) => line.sku || "—", rowHeader: true, nowrap: true },
  { key: "result", header: "Resultado", cell: (line) => <Badge tone={RESULT[line.result].tone}>{RESULT[line.result].label}</Badge> },
  { key: "detail", header: "Detalle", cell: (line) => line.detail },
];

/** Upload, review (nothing is written), then apply: same importCatalogAction as before. */
const applyLabel = (changes: number) => (changes === 1 ? "Aplicar 1 cambio" : `Aplicar ${changes} cambios`);

export function CatalogImport() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importCatalogAction, {});
  const toast = useToast();
  const announced = useRef<ImportState | null>(null);
  const report = state.report;
  const canApply = report?.dryRun && report.summary.created + report.summary.updated > 0;
  const review = report ? importReview(report) : null;
  const applied = report && !report.dryRun;

  useEffect(() => {
    if (applied && announced.current !== state) {
      announced.current = state;
      toast.show("Planilla aplicada.", { tone: "success" });
    }
  }, [applied, state, toast]);

  return (
    <>
      <Card section id="importar-archivo" title="Archivo">
        <form action={action} noValidate className={styles.grid2Stack}>
          <Input id="import-file" name="file" type="file" accept=".csv,text/csv" label="Archivo CSV" required error={state.error} hint="Hasta 512 KB." />
          <div className={styles.saveRow}>
            <Button type="submit" variant={canApply ? "secondary" : "primary"} loading={pending}>
              Revisar planilla
            </Button>
          </div>
        </form>
      </Card>

      {report && review && (
        <Card section id="importar-resultado" title={report.dryRun ? `Vista previa de ${state.fileName}` : "Planilla aplicada"}>
          <p className={styles.text} role="status">
            {report.dryRun && "Todavía no se cambió nada. "}
            {report.summary.created} nuevos · {report.summary.updated} con cambios · {report.summary.failed} con errores ·{" "}
            {review.unchanged} sin cambios (no se muestran)
          </p>
          {applied && (
            <div className={styles.saveRow}>
              <Button href="/admin/productos" variant="primary">
                Ver productos
              </Button>
            </div>
          )}
          {review.rows.length > 0 && (
            <DataTable
              caption={report.dryRun ? "Filas que cambian o tienen errores" : "Filas aplicadas o con errores"}
              captionHidden
              columns={COLUMNS}
              rows={review.rows}
              rowKey={(line) => String(line.row)}
              rowTone={(line) => (line.result === "failed" ? "critical" : undefined)}
            />
          )}
          {canApply && (
            <form action={action} className={styles.grid2Stack}>
              <input type="hidden" name="apply" value="1" />
              <input type="hidden" name="text" value={state.text ?? ""} />
              <input type="hidden" name="fileName" value={state.fileName ?? ""} />
              {report.summary.failed > 0 && <p className={styles.muted}>Las filas con error se saltean; corregilas y volvé a subir la planilla.</p>}
              <div className={styles.saveRow}>
                <Button type="submit" variant="primary" loading={pending}>
                  {applyLabel(report.summary.created + report.summary.updated)}
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </>
  );
}
