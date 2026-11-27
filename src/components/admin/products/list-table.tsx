import Image from "next/image";
import Link from "next/link";
import { RowCheckbox, SelectAllCheckbox } from "@/components/admin/selectable-table";
import { productStatusLabel, stockLabel } from "@/components/admin/shared";
import { Badge, type BadgeTone, VisuallyHidden } from "@/components/admin/ui";
import { formatPrice } from "@/lib/format";
import { listPrice, productStockState } from "@/server/admin/product-search";
import type { AdminProductListItem } from "@/server/admin/repository";
import type { ProductStatus } from "@/server/admin/validation";
import styles from "./list.module.css";

const STATUS_TONE: Record<ProductStatus, BadgeTone> = {
  active: "success",
  draft: "neutral",
  archived: "attention",
};

function PriceCell({ product }: { product: AdminProductListItem }) {
  const price = listPrice(product);
  if (price.kind === "quote") return <>A presupuestar</>;
  if (price.kind === "missing") return <span className={styles.meta}>Sin precio</span>;
  return <>{price.kind === "from" ? `desde ${formatPrice(price.minor / 100)}` : formatPrice(price.minor / 100)}</>;
}

/** Same rule as the "Sin stock" / "Stock bajo" filters (productStockState). */
function StockCell({ product }: { product: AdminProductListItem }) {
  const state = productStockState(product);
  if (state === "untracked") return <span className={styles.meta}>A pedido</span>;
  if (state === "out") {
    return (
      <span className={styles.stockCell}>
        <Badge tone="critical">Sin stock</Badge>
        {product.reserved > 0 && <span className={styles.meta}>{product.reserved} reservadas</span>}
      </span>
    );
  }
  if (state === "low") {
    return (
      <span className={styles.stockCell}>
        <Badge tone="warning">Stock bajo</Badge>
        <span className={styles.meta}>{stockLabel(product)}</span>
      </span>
    );
  }
  return <>{stockLabel(product)}</>;
}

/**
 * The products of one page. A server component: only the checkboxes read
 * the selection (client). Columns drop and rows turn into cards by the
 * list's width (list.module.css).
 */
export function ProductListTable({ products, categoryLabels }: { products: AdminProductListItem[]; categoryLabels: Record<string, string> }) {
  return (
    <table className={styles.table}>
      <caption>
        <VisuallyHidden>Productos</VisuallyHidden>
      </caption>
      <thead>
        <tr>
          <th scope="col" className={`${styles.th} ${styles.select}`}>
            <SelectAllCheckbox />
          </th>
          <th scope="col" className={`${styles.th} ${styles.thumb}`}>
            <VisuallyHidden>Imagen</VisuallyHidden>
          </th>
          <th scope="col" className={`${styles.th} ${styles.product}`}>
            Producto
          </th>
          <th scope="col" className={`${styles.th} ${styles.category}`}>
            Categoría
          </th>
          <th scope="col" className={`${styles.th} ${styles.price}`}>
            Precio
          </th>
          <th scope="col" className={`${styles.th} ${styles.stock}`}>
            Stock
          </th>
          <th scope="col" className={`${styles.th} ${styles.status}`}>
            Estado
          </th>
          <th scope="col" className={`${styles.th} ${styles.actions}`}>
            <VisuallyHidden>Acciones</VisuallyHidden>
          </th>
        </tr>
      </thead>
      <tbody>
        {products.map((product) => (
          <tr key={product.id} className={styles.row}>
            <td className={`${styles.td} ${styles.select}`}>
              <RowCheckbox id={product.id} label={product.name} />
            </td>
            <td className={`${styles.td} ${styles.thumb}`}>
              <Image src={product.coverUrl} alt="" width={40} height={40} />
            </td>
            <th scope="row" className={`${styles.td} ${styles.product}`}>
              <span className={styles.nameLine}>
                <Link href={`/admin/productos/${product.id}`} className={styles.name}>
                  {product.name}
                </Link>
                {product.featured && <Badge tone="info">Destacado</Badge>}
              </span>
              <span className={styles.meta}>
                {product.sku}
                {product.optionNames.length > 0 && ` · ${product.variantCount} ${product.variantCount === 1 ? "variante" : "variantes"}`}
              </span>
            </th>
            <td className={`${styles.td} ${styles.category}`}>{categoryLabels[product.categoryId] ?? product.categoryId}</td>
            <td className={`${styles.td} ${styles.price}`} data-label="Precio">
              <PriceCell product={product} />
            </td>
            <td className={`${styles.td} ${styles.stock}`} data-label="Stock">
              <StockCell product={product} />
            </td>
            <td className={`${styles.td} ${styles.status}`}>
              <Badge tone={STATUS_TONE[product.status]}>{productStatusLabel[product.status]}</Badge>
            </td>
            <td className={`${styles.td} ${styles.actions}`}>
              {product.status === "active" && (
                <Link href={`/producto/${product.slug}`} className={styles.storeLink}>
                  Ver<VisuallyHidden> {product.name}</VisuallyHidden> en la tienda
                </Link>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
