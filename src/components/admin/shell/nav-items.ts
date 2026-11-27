import type { AdminRole } from "../../../server/admin/repository.ts";

/**
 * Side menu links of the admin panel, as plain data (no JSX) so the role
 * filtering and the current-section matching can be tested with node --test.
 * The Sidebar maps each `icon` key to its SVG.
 */
export type NavIconKey =
  | "home"
  | "receipt"
  | "clipboard"
  | "users"
  | "tag"
  | "box"
  | "image"
  | "shirt"
  | "folder"
  | "layout"
  | "truck"
  | "map-pin"
  | "plug"
  | "gear"
  | "clock"
  | "palette";

export type NavLink = {
  href: string;
  label: string;
  icon: NavIconKey;
  /** "exact": only the href itself is current (Inicio at /admin would otherwise match every page). */
  match?: "exact";
  /** Only these roles see the link (the page itself enforces the same rule). */
  roles?: readonly AdminRole[];
};

export type NavGroup = { label: string; links: NavLink[] };

/** First item, above the groups. */
export const NAV_HOME: NavLink = { href: "/admin", label: "Inicio", icon: "home", match: "exact" };

/** Linked from the bottom of the sidebar, not part of the menu groups. */
export const DESIGN_SYSTEM_LINK: NavLink = { href: "/admin/sistema-de-diseno", label: "Sistema de diseño", icon: "palette" };

/** Sections of the panel, grouped by what the shop owner is doing. */
const GROUPS: NavGroup[] = [
  {
    label: "Ventas",
    links: [
      { href: "/admin/pedidos", label: "Pedidos", icon: "receipt" },
      { href: "/admin/encargos", label: "Encargos", icon: "clipboard" },
      { href: "/admin/clientes", label: "Clientes", icon: "users" },
      { href: "/admin/promociones", label: "Promociones", icon: "tag" },
    ],
  },
  {
    label: "Catálogo",
    links: [
      { href: "/admin/productos", label: "Productos", icon: "box" },
      { href: "/admin/disenos", label: "Diseños", icon: "image" },
      { href: "/admin/soportes", label: "Soportes", icon: "shirt" },
      { href: "/admin/categorias", label: "Categorías", icon: "folder" },
    ],
  },
  {
    label: "Tienda",
    links: [
      { href: "/admin/portada", label: "Portada", icon: "layout" },
      { href: "/admin/envios", label: "Envíos", icon: "truck" },
      { href: "/admin/puntos", label: "Puntos de venta", icon: "map-pin" },
    ],
  },
  {
    label: "Sistema",
    links: [
      // Owners only: /admin/integraciones answers 404 to editors.
      { href: "/admin/integraciones", label: "Integraciones (API)", icon: "plug", roles: ["owner"] },
      { href: "/admin/ajustes", label: "Ajustes", icon: "gear" },
      { href: "/admin/actividad", label: "Actividad", icon: "clock" },
    ],
  },
];

/** The menu groups a role can use; links the role cannot open are left out. */
export function navGroups(role: AdminRole): NavGroup[] {
  return GROUPS.map((group) => ({ ...group, links: group.links.filter((link) => !link.roles || link.roles.includes(role)) })).filter(
    (group) => group.links.length > 0,
  );
}

/** Whether `path` belongs to the link's section (the href itself or a sub-path). */
export function isCurrentLink(link: Pick<NavLink, "href" | "match">, path: string): boolean {
  if (link.match === "exact") return path === link.href;
  return path === link.href || path.startsWith(`${link.href}/`);
}

/**
 * The products list moved from /admin to /admin/productos. Old links and
 * bookmarks with list filters (/admin?stock=bajo) go to the list with the same
 * query; /admin without a query is the dashboard (null).
 */
export function legacyProductsHref(searchParams: Record<string, string | string[] | undefined>): string | null {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  const text = query.toString();
  return text ? `/admin/productos?${text}` : null;
}
