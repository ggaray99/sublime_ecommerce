"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import {
  BoxIcon,
  ClipboardIcon,
  ClockIcon,
  FolderIcon,
  GearIcon,
  HomeIcon,
  ImageIcon,
  MapPinIcon,
  PlugIcon,
  ReceiptIcon,
  ShirtIcon,
  SidebarIcon,
  TagIcon,
  TruckIcon,
  UsersIcon,
  type AdminIcon,
} from "./admin-icons";

type NavLink = { href: string; label: string; icon: AdminIcon; match?: (path: string) => boolean };

/** Sections of the panel, grouped by what the shop owner is doing. */
const GROUPS: { label: string; links: NavLink[] }[] = [
  {
    label: "Ventas",
    links: [
      { href: "/admin/pedidos", label: "Pedidos", icon: ReceiptIcon },
      { href: "/admin/encargos", label: "Encargos", icon: ClipboardIcon },
      { href: "/admin/clientes", label: "Clientes", icon: UsersIcon },
      { href: "/admin/promociones", label: "Promociones", icon: TagIcon },
    ],
  },
  {
    label: "Catálogo",
    links: [
      // Products live at /admin and /admin/productos/…
      { href: "/admin", label: "Productos", icon: BoxIcon, match: (path) => path === "/admin" || path.startsWith("/admin/productos") },
      { href: "/admin/disenos", label: "Diseños", icon: ImageIcon },
      { href: "/admin/soportes", label: "Soportes", icon: ShirtIcon },
      { href: "/admin/categorias", label: "Categorías", icon: FolderIcon },
    ],
  },
  {
    label: "Tienda",
    links: [
      { href: "/admin/portada", label: "Portada", icon: HomeIcon },
      { href: "/admin/envios", label: "Envíos", icon: TruckIcon },
      { href: "/admin/puntos", label: "Puntos de venta", icon: MapPinIcon },
    ],
  },
  {
    label: "Sistema",
    links: [
      { href: "/admin/integraciones", label: "Integraciones (API)", icon: PlugIcon },
      { href: "/admin/ajustes", label: "Ajustes", icon: GearIcon },
      { href: "/admin/actividad", label: "Actividad", icon: ClockIcon },
    ],
  },
];

const isCurrent = (link: Pick<NavLink, "href" | "match">, path: string) => (link.match ? link.match(path) : path === link.href || path.startsWith(`${link.href}/`));

const STORAGE_KEY = "sublime-admin-nav";

/**
 * Side menu of the panel. On wide screens it can be folded to a rail of icons
 * (the choice is remembered on this browser); on small screens it starts
 * folded and opens over the content. Folded, each icon keeps its section name
 * as hidden text, shown as a tooltip on hover and keyboard focus.
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
        <SidebarIcon open={open} />
        <span className="admin-sidenav__label">{open ? "Ocultar menú" : "Mostrar menú"}</span>
      </button>
      <nav id={`${id}-menu`} className="admin-sidenav__menu" aria-label="Secciones del panel">
        {GROUPS.map((group) => (
          <div key={group.label} className="admin-sidenav__group">
            <p className="admin-sidenav__group-label">{group.label}</p>
            <ul>
              {group.links.map(({ icon: LinkIcon, ...link }) => (
                <li key={link.href}>
                  <Link href={link.href} aria-current={isCurrent(link, path) ? "page" : undefined} onClick={onNavigate}>
                    <LinkIcon />
                    <span className="admin-sidenav__label">{link.label}</span>
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
