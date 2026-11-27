"use client";

import { useEffect } from "react";
import styles from "@/components/admin/products/list.module.css";
import { Button, EmptyState } from "@/components/admin/ui";

/**
 * Error boundary for the customers pages (list and profile). In this Next.js
 * version `retry()` re-fetches the segment from the server (`reset()` would
 * only re-render).
 */
export default function CustomersError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="contenido" className={styles.page}>
      <EmptyState
        appearance="card"
        heading="No pudimos cargar los clientes"
        action={
          <Button variant="primary" onClick={retry}>
            Reintentar
          </Button>
        }
      >
        <p>Puede ser un problema momentáneo de conexión. Las cuentas, los pedidos y los encargos guardados no se pierden.</p>
      </EmptyState>
    </main>
  );
}
