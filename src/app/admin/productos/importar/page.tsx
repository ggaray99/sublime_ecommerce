import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CatalogImport } from "@/components/admin/catalog-import";
import { AdminUnavailable } from "@/components/admin/shared";
import { PageIntro } from "@/components/page-intro";
import { CSV_COLUMNS, MAX_IMPORT_ROWS } from "@/server/admin/csv";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";

export const metadata: Metadata = {
  title: "Importar planilla · Administración",
  robots: { index: false, follow: false },
};

async function ImportPanel() {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();
  return (
    <div className="account">
      <p>
        <Link href="/admin">← Volver a productos</Link>
      </p>
      <section className="account__section" aria-labelledby="importar-title">
        <h2 id="importar-title">Importar planilla</h2>
        <ol className="steps-list">
          <li>
            <a href="/admin/productos/exportar" download>
              Descargá la planilla actual
            </a>{" "}
            y abrila en Excel o Google Sheets.
          </li>
          <li>Cambiá lo que necesites: precios, costos, stock, peso y medidas. Una fila por SKU (cada talle o color tiene el suyo).</li>
          <li>Guardala como CSV y subila acá. Primero ves qué va a cambiar; recién al tocar “Aplicar” se guarda.</li>
        </ol>
        <p className="muted">
          Columnas: {CSV_COLUMNS.join(", ")}. Una celda vacía no cambia nada. Un SKU nuevo crea el producto en borrador (con
          nombre, categoría y precio). Precios en pesos (8900 o 8.900,50), medidas en cm. Hasta {MAX_IMPORT_ROWS} filas por archivo.
          El stock importado queda registrado como ajuste.
        </p>
        <CatalogImport />
      </section>
    </div>
  );
}

export default function ImportPage() {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="IMPORTAR PLANILLA." tone="light">
        <p>Cambios masivos de precios, costos, stock y logística.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <ImportPanel />
      </Suspense>
    </main>
  );
}
