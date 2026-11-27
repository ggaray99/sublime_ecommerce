import Link from "next/link";
import type { InventorySummary } from "@/server/inventory/admin-inventory";
import s from "./list.module.css";

const products = (n: number) => (n === 1 ? "producto" : "productos");

type Stat = { label: string; value: string; note: string; link?: { href: string; label: string } };

/**
 * The inventory summary. Each card says what it counts; the "Sin stock" and
 * "Stock bajo" product counts are the same numbers as Productos and Inicio and
 * link to that filtered list.
 */
export function InventorySummaryCards({ summary }: { summary: InventorySummary }) {
  const stats: Stat[] = [
    {
      label: "Productos con stock administrado",
      value: String(summary.trackedProducts),
      note: `${products(summary.trackedProducts)} que llevan control de stock (no a pedido)`,
    },
    {
      label: "Variantes administradas",
      value: String(summary.trackedVariants),
      note: "variantes activas con control de stock",
    },
    {
      label: "Sin stock",
      value: String(summary.outOfStockProducts),
      note: `${products(summary.outOfStockProducts)} sin unidades disponibles`,
      link: { href: "/admin/productos?stock=sin", label: "Ver productos sin stock" },
    },
    {
      label: "Stock bajo",
      value: String(summary.lowStockProducts),
      note: `${products(summary.lowStockProducts)} con pocas unidades disponibles`,
      link: { href: "/admin/productos?stock=bajo", label: "Ver productos con stock bajo" },
    },
    {
      label: "Unidades disponibles",
      value: String(summary.availableUnits),
      note: "para vender ahora (físico menos reservado)",
    },
    {
      label: "Unidades reservadas",
      value: String(summary.reservedUnits),
      note: "por pedidos pendientes de pago",
    },
  ];

  return (
    <section className={s.summaryBox} aria-label="Resumen del inventario">
      <ul className={s.summaryGrid}>
        {stats.map((stat) => (
          <li key={stat.label} className={s.stat}>
            <span className={s.statLabel}>{stat.label}</span>
            <span className={s.statValue}>{stat.value}</span>
            <span className={s.statNote}>{stat.note}</span>
            {stat.link && (
              <Link href={stat.link.href} className={s.statLink}>
                {stat.link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
