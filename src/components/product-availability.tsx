import { connection } from "next/server";
import { formatPrice } from "@/lib/format";
import { hasDatabase } from "@/server/db/client";
import { getRepositories } from "@/server/repositories";

/**
 * Live price and stock from the database (staging/previews). Production keeps
 * the static catalog and renders nothing here.
 */
export async function ProductAvailability({ productId, staticPriceMinor }: { productId: string; staticPriceMinor: number | null }) {
  if (!hasDatabase()) return null;
  await connection();
  const { catalog, inventory } = getRepositories();
  const variant = (await catalog.findVariantsByProductIds([productId])).get(productId);
  if (!variant) return null;
  if (!variant.active) return <p className="stock-note stock-note--out">Producto no disponible por el momento.</p>;

  const available = (await inventory.getAvailability([variant.sku])).get(variant.sku);
  const priceChanged = variant.unitPriceMinor !== null && variant.unitPriceMinor !== staticPriceMinor;
  return (
    <div className="stock-note-group">
      {available === null || available === undefined ? (
        <p className="stock-note">Se fabrica a pedido.</p>
      ) : available > 0 ? (
        <p className="stock-note stock-note--in">
          Stock disponible: {available} {available === 1 ? "unidad" : "unidades"}
        </p>
      ) : (
        <p className="stock-note stock-note--out">Sin stock por ahora.</p>
      )}
      {priceChanged && variant.unitPriceMinor !== null && (
        <p className="stock-note">Precio actualizado: {formatPrice(variant.unitPriceMinor / 100)}</p>
      )}
      <p className="fine-print">Datos del entorno de prueba (staging).</p>
    </div>
  );
}
