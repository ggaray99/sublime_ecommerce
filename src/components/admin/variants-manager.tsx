import type { AdminProduct } from "@/server/admin/repository";
import type { AdminVariant } from "@/server/admin/variants-repository";
import { optionsLabel } from "@/server/admin/variants";
import { priceInput } from "./shared";
import { OptionsForm, VariantRow } from "./variant-forms";
import styles from "./products/product-page.module.css";

/** Values of each option in their current order (from the active variants first). */
function currentDefinitions(product: AdminProduct, variants: AdminVariant[]) {
  const ordered = [...variants].sort((a, b) => Number(b.active) - Number(a.active));
  return product.optionNames.map((name) => ({
    name,
    values: [...new Set(ordered.filter((variant) => variant.active).map((variant) => variant.options[name]).filter(Boolean))],
  }));
}

export function VariantsManager({ product, variants }: { product: AdminProduct; variants: AdminVariant[] }) {
  const definitions = currentDefinitions(product, variants);
  const hasOptions = product.optionNames.length > 0;

  return (
    <>
      {hasOptions ? (
        <div className={styles.tableRegion} role="region" aria-labelledby="variantes-tabla" tabIndex={0}>
          <table className={styles.table}>
            <caption id="variantes-tabla" className="visually-hidden">
              Variantes de {product.name}
            </caption>
            <thead>
              <tr>
                <th scope="col">Variante</th>
                <th scope="col">SKU</th>
                <th scope="col">Stock</th>
                <th scope="col">Precio</th>
                <th scope="col">Activa</th>
                <th scope="col">
                  <span className="visually-hidden">Guardar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {variants.map((variant) => {
                const label = optionsLabel(variant.options, product.optionNames) || "Sin opciones";
                return (
                  <VariantRow
                    key={variant.id}
                    productId={product.id}
                    variantId={variant.id}
                    label={label}
                    sku={variant.sku}
                    stock={
                      variant.trackStock
                        ? `${Math.max(0, variant.onHand - variant.reserved)}${variant.reserved ? ` (${variant.reserved} reservadas)` : ""}`
                        : "A pedido"
                    }
                    price={priceInput(variant.priceMinor)}
                    active={variant.active}
                    priced={!product.requiresQuote}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.muted}>
          Este producto se vende en una sola versión. Si viene en talles o colores, definí las opciones y se crea una variante por
          combinación, cada una con su SKU, precio y stock.
        </p>
      )}

      <div className={styles.block}>
        <h3 className={styles.subtitle}>{hasOptions ? "Opciones" : "Definir opciones"}</h3>
        <OptionsForm
          productId={product.id}
          hasOptions={hasOptions}
          initial={{
            option1Name: definitions[0]?.name ?? "",
            option1Values: definitions[0]?.values.join(", ") ?? "",
            option2Name: definitions[1]?.name ?? "",
            option2Values: definitions[1]?.values.join(", ") ?? "",
          }}
        />
      </div>
    </>
  );
}
