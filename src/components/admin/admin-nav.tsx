import Link from "next/link";

const LINKS = [
  { id: "pedidos", href: "/admin/pedidos", label: "Pedidos" },
  { id: "encargos", href: "/admin/encargos", label: "Encargos" },
  { id: "envios", href: "/admin/envios", label: "Envíos" },
  { id: "puntos", href: "/admin/puntos", label: "Puntos de venta" },
  { id: "portada", href: "/admin/portada", label: "Portada" },
  { id: "productos", href: "/admin", label: "Productos" },
  { id: "categorias", href: "/admin/categorias", label: "Categorías" },
  { id: "integraciones", href: "/admin/integraciones", label: "Integraciones (API)" },
  { id: "ajustes", href: "/admin/ajustes", label: "Ajustes" },
  { id: "actividad", href: "/admin/actividad", label: "Actividad" },
] as const;

export function AdminNav({ current }: { current: (typeof LINKS)[number]["id"] }) {
  return (
    <nav className="admin-nav" aria-label="Administración">
      {LINKS.map((link) => (
        <Link key={link.id} href={link.href} aria-current={link.id === current ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
