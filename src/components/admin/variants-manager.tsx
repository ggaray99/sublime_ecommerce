import type { AdminProduct } from "@/server/admin/repository";
import type { AdminVariant } from "@/server/admin/variants-repository";
import { optionsLabel } from "@/server/admin/variants";
import { priceInput } from "./shared";
import { OptionsForm, VariantRowForm } from "./variant-forms";

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
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Variante</th>
                <th scope="col">SKU</th>
                <th scope="col">Stock</th>
                <th scope="col">Precio y estado</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((variant) => {
                const label = optionsLabel(variant.options, product.optionNames) || "Sin opciones";
                return (
                  <tr key={variant.id} className={variant.active ? undefined : "is-inactive"}>
                    <th scope="row">
                      {label}
                      {!variant.active && <span className="badge badge--pending">Inactiva</span>}
                    </th>
                    <td>{variant.sku}</td>
                    <td>
                      {variant.trackStock
                        ? `${Math.max(0, variant.onHand - variant.reserved)}${variant.reserved ? ` (${variant.reserved} reservadas)` : ""}`
                        : "A pedido"}
                    </td>
                    <td>
                      <VariantRowForm
                        productId={product.id}
                        variantId={variant.id}
                        label={label}
                        price={priceInput(variant.priceMinor)}
                        active={variant.active}
                        priced={!product.requiresQuote}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">
          Este producto se vende en una sola versión. Si viene en talles o colores, definí las opciones y se crea una variante por
          combinación, cada una con su SKU, precio y stock.
        </p>
      )}

      <h3 className="account__subtitle">{hasOptions ? "Opciones" : "Definir opciones"}</h3>
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
    </>
  );
}
