"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { exitPreviewAction } from "@/app/preview-actions";

const subscribe = () => () => {};
const inPreview = () => document.cookie.split("; ").includes("sublime_preview_on=1");

/**
 * Shown only to an admin previewing the closed store (cookie set from the
 * panel). Read in the browser, so prerendered pages stay the same for everyone.
 */
export function PreviewBar() {
  const visible = useSyncExternalStore(subscribe, inPreview, () => false);
  if (!visible) return null;
  return (
    <div className="preview-bar" role="status">
      <p>
        <strong>Vista previa</strong> · La tienda está cerrada: los clientes ven “Estamos trabajando”.
      </p>
      <div className="preview-bar__actions">
        <Link href="/admin/ajustes">Volver al panel</Link>
        <form action={exitPreviewAction}>
          <button type="submit" className="link-button">
            Salir de la vista previa
          </button>
        </form>
      </div>
    </div>
  );
}
