import Image from "next/image";
import Link from "next/link";
import p from "@/components/admin/products/list.module.css";
import { Badge, type BadgeTone, cx, VisuallyHidden } from "@/components/admin/ui";
import type { StockState } from "@/server/admin/product-search";
import type { InventoryRow } from "@/server/inventory/admin-inventory";
import s from "./list.module.css";

/** The products list badges (productStockState), per variant. Tracked rows are never "untracked". */
const STATE: Record<Exclude<StockState, "untracked">, { label: string; tone: BadgeTone }> = {
  out: { label: "Sin stock", tone: "critical" },
  low: { label: "Stock bajo", tone: "warning" },
  in: { label: "En stock", tone: "success" },
};

/**
 * The tracked variants of one page: physical, reserved and available stock.
 * A server component with no actions (adjustments live in each product's
 * inventory page). SKU drops below ~880px of list width and rows turn into
 * cards below ~600px (list.module.css).
 */
export function InventoryListTable({ rows }: { rows: InventoryRow[] }) {
  return (
    <table className={cx(p.table, s.table)}>
      <caption>
        <VisuallyHidden>Stock por variante</VisuallyHidden>
      </caption>
      <thead>
        <tr>
          <th scope="col" className={cx(p.th, p.thumb)}>
            <VisuallyHidden>Imagen</VisuallyHidden>
          </th>
          <th scope="col" className={p.th}>
            Producto
          </th>
          <th scope="col" className={cx(p.th, s.wideOnly)}>
            SKU
          </th>
          <th scope="col" className={cx(p.th, s.number)}>
            Físico
          </th>
          <th scope="col" className={cx(p.th, s.number)}>
            Reservado
          </th>
          <th scope="col" className={cx(p.th, s.number)}>
            Disponible
          </th>
          <th scope="col" className={p.th}>
            Estado
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const state = row.state === "untracked" ? null : STATE[row.state];
          return (
            <tr key={row.variantId} className={cx(s.row, s.variantRow)}>
              <td className={cx(p.td, p.thumb, s.cell, s.thumbCell)}>
                <Image src={row.coverUrl} alt="" width={40} height={40} />
              </td>
              <th scope="row" className={cx(p.td, s.cell, s.product, s.lead)}>
                <span className={s.nameLine}>
                  <Link href={`/admin/inventario/${encodeURIComponent(row.productId)}`} className={s.name}>
                    {row.productName}
                  </Link>
                  {!row.active && <Badge tone="neutral">Inactiva</Badge>}
                </span>
                <span className={p.meta}>{row.optionsLabel}</span>
              </th>
              <td className={cx(p.td, s.cell, s.sku, s.wideOnly)} data-label="SKU">
                {row.sku}
              </td>
              <td className={cx(p.td, s.cell, s.number)} data-label="Físico">
                {row.onHand}
              </td>
              <td className={cx(p.td, s.cell, s.number)} data-label="Reservado">
                {row.reserved}
              </td>
              <td className={cx(p.td, s.cell, s.number)} data-label="Disponible">
                {row.available}
              </td>
              <td className={cx(p.td, s.cell, s.state, s.corner)}>{state && <Badge tone={state.tone}>{state.label}</Badge>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
