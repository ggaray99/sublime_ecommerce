"use client";

import { useEffect } from "react";
import styles from "@/components/admin/products/list.module.css";
import { Button, EmptyState } from "@/components/admin/ui";

/**
 * Error boundary for the orders pages (list and detail). In this Next.js
 * version `retry()` re-fetches the segment from the server (`reset()` would
 * only re-render).
 */
export default function OrdersError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="contenido" className={styles.page}>
      <EmptyState
        appearance="card"
        heading="No pudimos cargar los pedidos"
        action={
          <Button variant="primary" onClick={retry}>
            Reintentar
          </Button>
        }
      >
        <p>Puede ser un problema momentáneo de conexión. Los pedidos y sus cambios ya guardados no se pierden.</p>
      </EmptyState>
    </main>
  );
}
