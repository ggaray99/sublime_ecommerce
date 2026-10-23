import Link from "next/link";

const LINKS = [
  { id: "pedidos", href: "/admin/pedidos", label: "Pedidos" },
  { id: "envios", href: "/admin/envios", label: "Envíos" },
  { id: "productos", href: "/admin", label: "Productos" },
  { id: "categorias", href: "/admin/categorias", label: "Categorías" },
  { id: "integraciones", href: "/admin/integraciones", label: "Integraciones (API)" },
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
