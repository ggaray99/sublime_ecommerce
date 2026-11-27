import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CatalogImport } from "@/components/admin/catalog-import";
import styles from "@/components/admin/products/product-page.module.css";
import { AdminUnavailable } from "@/components/admin/shared";
import { Breadcrumbs, Card, cx, PageHeader, Skeleton, SkeletonBlock, SkeletonText, Stack } from "@/components/admin/ui";
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
    <Stack gap={4}>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Productos", href: "/admin/productos" }, { label: "Importar planilla" }]} />}
        back={{ href: "/admin/productos", label: "Volver a Productos" }}
        title="Importar planilla"
        subtitle="Cambios masivos de precios, costos, stock y logística."
      />
      <Card section id="importar-pasos" title="Cómo funciona">
        <ol className={styles.steps}>
          <li>
            <a href="/admin/productos/exportar" download>
              Descargá la planilla actual
            </a>{" "}
            y abrila en Excel o Google Sheets.
          </li>
          <li>Cambiá lo que necesites: precios, costos, stock, peso y medidas. Una fila por SKU (cada talle o color tiene el suyo).</li>
          <li>Guardala como CSV y subila acá. Primero ves qué va a cambiar; recién al tocar “Aplicar” se guarda.</li>
        </ol>
        <p className={styles.muted}>
          Columnas: {CSV_COLUMNS.join(", ")}. Una celda vacía no cambia nada. Un SKU nuevo crea el producto en borrador (con
          nombre, categoría y precio). Precios en pesos (8900 o 8.900,50), medidas en cm. Hasta {MAX_IMPORT_ROWS} filas por archivo.
          El stock importado queda registrado como ajuste.
        </p>
      </Card>
      <CatalogImport />
    </Stack>
  );
}

export default function ImportPage() {
  return (
    <main id="contenido" className={cx(styles.page, styles.narrow)}>
      <Suspense
        fallback={
          <Skeleton>
            <Stack gap={4}>
              <SkeletonText lines={2} />
              <SkeletonBlock height={240} />
            </Stack>
          </Skeleton>
        }
      >
        <ImportPanel />
      </Suspense>
    </main>
  );
}
