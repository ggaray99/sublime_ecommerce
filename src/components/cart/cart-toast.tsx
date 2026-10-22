"use client";

import Link from "next/link";
import { dismissToast, useToast } from "./toast-store";

/** Polite live region announcing cart additions. Auto-dismisses after a few seconds. */
export function CartToast() {
  const toast = useToast();
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.id}>
          <p>{toast.message}</p>
          <div className="toast__actions">
            <Link href="/carrito" onClick={dismissToast}>
              Ver carrito
            </Link>
            <button type="button" onClick={dismissToast} aria-label="Cerrar aviso">
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
