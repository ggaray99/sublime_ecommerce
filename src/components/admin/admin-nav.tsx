"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

type NavLink = { href: string; label: string; match?: (path: string) => boolean };

/** Sections of the panel, grouped by what the shop owner is doing. */
const GROUPS: { label: string; links: NavLink[] }[] = [
  {
    label: "Ventas",
    links: [
      { href: "/admin/pedidos", label: "Pedidos" },
      { href: "/admin/encargos", label: "Encargos" },
      { href: "/admin/clientes", label: "Clientes" },
      { href: "/admin/promociones", label: "Promociones" },
    ],
  },
  {
    label: "Catálogo",
    links: [
      // Products live at /admin and /admin/productos/…
      { href: "/admin", label: "Productos", match: (path) => path === "/admin" || path.startsWith("/admin/productos") },
      { href: "/admin/disenos", label: "Diseños" },
      { href: "/admin/soportes", label: "Soportes" },
      { href: "/admin/categorias", label: "Categorías" },
    ],
  },
  {
    label: "Tienda",
    links: [
      { href: "/admin/portada", label: "Portada" },
      { href: "/admin/envios", label: "Envíos" },
      { href: "/admin/puntos", label: "Puntos de venta" },
    ],
  },
  {
    label: "Sistema",
    links: [
      { href: "/admin/integraciones", label: "Integraciones (API)" },
      { href: "/admin/ajustes", label: "Ajustes" },
      { href: "/admin/actividad", label: "Actividad" },
    ],
  },
];

const isCurrent = (link: NavLink, path: string) => (link.match ? link.match(path) : path === link.href || path.startsWith(`${link.href}/`));

const STORAGE_KEY = "sublime-admin-nav";

/**
 * Side menu of the panel. On wide screens it can be folded to a thin rail (the
 * choice is remembered on this browser); on small screens it starts folded and
 * opens over the content.
 */
export function AdminNav() {
  const path = usePathname();
  const id = useId();
  const [open, setOpen] = useState(true);

  // Small screens start folded; wide screens restore the last choice.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage blocked: keep the default.
    }
    const small = window.matchMedia("(max-width: 899px)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state once after hydration
    setOpen(small ? false : saved !== "closed");
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      if (!window.matchMedia("(max-width: 899px)").matches) window.localStorage.setItem(STORAGE_KEY, next ? "open" : "closed");
    } catch {
      // Storage blocked: the choice lasts for this visit.
    }
  };

  // On small screens, choosing a section folds the menu again.
  const onNavigate = () => {
    if (window.matchMedia("(max-width: 899px)").matches) setOpen(false);
  };

  return (
    <aside className={`admin-sidenav${open ? " is-open" : ""}`}>
      <button type="button" className="admin-sidenav__toggle" aria-expanded={open} aria-controls={`${id}-menu`} onClick={toggle}>
        <span aria-hidden="true">{open ? "«" : "☰"}</span>
        <span className="admin-sidenav__toggle-label">{open ? "Ocultar menú" : "Menú"}</span>
      </button>
      <nav id={`${id}-menu`} className="admin-sidenav__menu" aria-label="Secciones del panel" hidden={!open}>
        {GROUPS.map((group) => (
          <div key={group.label} className="admin-sidenav__group">
            <p className="admin-sidenav__group-label">{group.label}</p>
            <ul>
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} aria-current={isCurrent(link, path) ? "page" : undefined} onClick={onNavigate}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
