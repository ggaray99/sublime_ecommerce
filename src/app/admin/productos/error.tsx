"use client";

import { useEffect } from "react";
import { Button, EmptyState } from "@/components/admin/ui";
import styles from "@/components/admin/products/list.module.css";

/**
 * Error boundary for the products pages. In this Next.js version `retry()`
 * re-fetches the segment from the server (`reset()` would only re-render).
 */
export default function ProductsError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="contenido" className={styles.page}>
      <EmptyState
        appearance="card"
        heading="No pudimos cargar los productos"
        action={
          <Button variant="primary" onClick={retry}>
            Reintentar
          </Button>
        }
      >
        <p>Puede ser un problema momentáneo de conexión. Los cambios que ya guardaste no se pierden.</p>
      </EmptyState>
    </main>
  );
}
