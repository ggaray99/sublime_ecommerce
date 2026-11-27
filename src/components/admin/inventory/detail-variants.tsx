import { Badge, Card, EmptyState, type BadgeTone } from "@/components/admin/ui";
import { productStockState, type StockState } from "@/server/admin/product-search";
import type { InventoryDetail } from "@/server/inventory/admin-detail";
import { AdjustStockButton, AdjustStockProvider, type AdjustableVariant } from "./adjust-stock";
import { variantOptionsText } from "./detail-helpers";
import styles from "./detail.module.css";

/** Stock state badge: the products list rule (productStockState), per variant with the product threshold. */
export const STOCK_BADGE: Record<StockState, { label: string; tone: BadgeTone }> = {
  in: { label: "En stock", tone: "success" },
  low: { label: "Stock bajo", tone: "warning" },
  out: { label: "Sin stock", tone: "critical" },
  untracked: { label: "A pedido", tone: "neutral" },
};

/**
 * Every variant (inactive ones too, read-only and marked "Inactiva") with
 * physical, reserved and available units, its stock state and, for tracked
 * active variants, the "Ajustar" dialog. Totals sum the active variants only.
 */
export function VariantsCard({ detail, maxStock }: { detail: InventoryDetail; maxStock: number }) {
  const adjustable: AdjustableVariant[] = detail.variants
    .filter((variant) => variant.active && variant.trackStock)
    .map((variant) => ({
      sku: variant.sku,
      label: variantOptionsText(variant.options, detail.optionNames),
      onHand: variant.onHand,
      reserved: variant.reserved,
    }));
  const tracked = detail.trackStock;
  const captionId = "variantes-tabla";

  const table = (
    <div className={styles.tableWrap} role="region" aria-labelledby={captionId} tabIndex={0}>
      <table className={styles.table}>
        <caption id={captionId} className={styles.srOnlyCaption}>
          Stock por variante
        </caption>
        <thead>
          <tr>
            <th scope="col">Variante</th>
            <th scope="col">SKU</th>
            <th scope="col" className={styles.number}>
              Físico
            </th>
            <th scope="col" className={styles.number}>
              Reservado
            </th>
            <th scope="col" className={styles.number}>
              Disponible
            </th>
            <th scope="col">Estado</th>
            {tracked && <th scope="col">Acción</th>}
          </tr>
        </thead>
        <tbody>
          {detail.variants.map((variant) => {
            const label = variantOptionsText(variant.options, detail.optionNames);
            const state = STOCK_BADGE[productStockState({ ...variant, lowStockThreshold: detail.threshold })];
            const counted = variant.trackStock;
            return (
              <tr key={variant.id} className={variant.active ? undefined : styles.inactiveRow}>
                <th scope="row">
                  <span className={styles.variantName}>
                    {label}
                    {!variant.active && <Badge tone="neutral">Inactiva</Badge>}
                  </span>
                </th>
                <td>
                  <span className={styles.sku}>{variant.sku}</span>
                </td>
                <td className={styles.number}>{counted ? variant.onHand : "—"}</td>
                <td className={styles.number}>{counted ? variant.reserved : "—"}</td>
                <td className={styles.number}>{counted ? variant.available : "—"}</td>
                <td>
                  <Badge tone={state.tone}>{state.label}</Badge>
                </td>
                {tracked && <td>{variant.active && counted ? <AdjustStockButton sku={variant.sku} label={label} /> : null}</td>}
              </tr>
            );
          })}
        </tbody>
        {tracked && (
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>
                Total (variantes activas)
              </th>
              <td className={styles.number}>{detail.totals.onHand}</td>
              <td className={styles.number}>{detail.totals.reserved}</td>
              <td className={styles.number}>{detail.totals.available}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );

  return (
    <Card section id="variantes" title="Variantes">
      <div className={styles.body}>
        {tracked ? (
          <AdjustStockProvider productId={detail.id} maxStock={maxStock} variants={adjustable}>
            {table}
            <p className={styles.meta}>
              Disponible = físico − reservado. Las variantes inactivas se muestran solo como referencia y no suman al total.
            </p>
          </AdjustStockProvider>
        ) : (
          <>
            <EmptyState heading="Producto a pedido" headingLevel={3}>
              <p>Producto a pedido: se fabrica para cada pedido y no lleva stock.</p>
            </EmptyState>
            {table}
          </>
        )}
      </div>
    </Card>
  );
}
