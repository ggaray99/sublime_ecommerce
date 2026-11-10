"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const inPreview = () => document.cookie.split("; ").includes("sublime_preview_on=1");

/**
 * Shown only to an admin previewing the closed store (cookie set from the
 * panel). Read in the browser, so prerendered pages stay the same for everyone.
 * It lives in the root layout and survives client navigations: reading the
 * pathname re-renders it on each one, and the cookie is read again then.
 */
export function PreviewBar() {
  usePathname();
  const visible = useSyncExternalStore(subscribe, inPreview, () => false);
  if (!visible) return null;
  return (
    <div className="preview-bar" role="status">
      <p>
        <strong>Vista previa</strong> · La tienda está cerrada: los clientes ven “Estamos trabajando”.
      </p>
      <div className="preview-bar__actions">
        <Link href="/admin/ajustes">Volver al panel</Link>
        {/* A full page load, so the whole page switches to what customers see. */}
        <a href="/vista-previa/salir">Salir de la vista previa</a>
      </div>
    </div>
  );
}
