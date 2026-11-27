import { AdminDataError, type Admin, type AdminProduct, type AdminRepository } from "./repository.ts";
import { parseProductUpdate, type ProductStatus, type ProductUpdateInput } from "./validation.ts";

/** One list page: bulk changes apply to what the person can see and check. */
export const MAX_BULK_PRODUCTS = 50;

/** A change applied to one or many products from the panel. */
export type ProductChange = { status: ProductStatus } | { featured: boolean };

export type ProductChangeItem = { id: string; name: string };
export type ProductChangeResult = {
  changed: ProductChangeItem[];
  /** Already had that status or featured value: nothing to save, no audit entry. */
  unchanged: ProductChangeItem[];
  /** Refused, with the reason the product page would give. */
  skipped: (ProductChangeItem & { reason: string })[];
};

/** Editable fields as the update validator expects them (shared with API v1). */
export const updateInputOf = (product: AdminProduct): ProductUpdateInput => ({
  name: product.name,
  slug: product.slug,
  description: product.description,
  categoryId: product.categoryId,
  theme: product.theme,
  tags: product.tags,
  details: product.details,
  featured: product.featured,
  catalogCode: product.catalogCode,
  status: product.status,
  priceMinor: product.priceMinor,
});

const isSame = (product: AdminProduct, change: ProductChange) =>
  "status" in change ? product.status === change.status : product.featured === change.featured;

/**
 * Applies `change` product by product with the product page's own rules:
 * the current values plus the change go through parseProductUpdate, then
 * repo.updateProduct, which writes the `product.update` audit entry. A product
 * the page would refuse is skipped with that message; the rest still apply.
 */
export async function changeProducts(
  repo: AdminRepository,
  actor: Admin,
  ids: readonly string[],
  change: ProductChange,
): Promise<ProductChangeResult> {
  const unique = [...new Set(ids)];
  if (unique.length > MAX_BULK_PRODUCTS) {
    throw new RangeError(`Podés cambiar hasta ${MAX_BULK_PRODUCTS} productos por vez.`);
  }
  const result: ProductChangeResult = { changed: [], unchanged: [], skipped: [] };
  for (const id of unique) {
    let current: AdminProduct;
    try {
      current = await repo.getProduct(id);
    } catch (error) {
      if (error instanceof AdminDataError && error.code === "not_found") {
        result.skipped.push({ id, name: id, reason: "El producto no existe." });
        continue;
      }
      throw error;
    }
    const item = { id: current.id, name: current.name };
    if (isSame(current, change)) {
      result.unchanged.push(item);
      continue;
    }
    const parsed = parseProductUpdate({ ...updateInputOf(current), ...change }, current.requiresQuote);
    if (!parsed.ok) {
      const reason = Object.values(parsed.errors).find((message): message is string => typeof message === "string");
      result.skipped.push({ ...item, reason: reason ?? "No se pudo guardar." });
      continue;
    }
    await repo.updateProduct(actor, current.id, parsed.value);
    result.changed.push(item);
  }
  return result;
}
