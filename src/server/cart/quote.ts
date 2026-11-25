import type { CatalogRepository } from "../catalog/repository.ts";
import { designLineName, offersSku, type DesignOfferRepository } from "../designs/offers.ts";
import type { MockupKind } from "../../lib/designs/kinds.ts";
import { MOCKUPS, placementKey, type GarmentPlacement } from "../../lib/designs/mockups.ts";
import type { InventoryRepository } from "../inventory/repository.ts";
import { DEFAULT_CURRENCY, multiplyMinor, type Currency } from "../money.ts";

export const MAX_CART_LINES = 50;
export const MAX_LINE_QUANTITY = 99;

/**
 * `sku` picks a variant (size, color…); without it the product's default variant is used.
 * `designId` prints a published design on that product (a base product of the design);
 * `placement` is where the customer placed it (side, width and position in cm).
 */
export type QuoteRequestLine = { productId: string; quantity: number; sku?: string; designId?: string; placement?: GarmentPlacement };

/** A placement with the base product kind the server resolved (never sent by the browser): what an order line stores. */
export type PlacedDesign = GarmentPlacement & { kind: MockupKind };

export type QuoteIssueCode =
  | "unknown_product"
  | "variant_required"
  | "requires_quote"
  | "not_purchasable"
  | "insufficient_stock"
  | "design_unavailable"
  | "placement_unavailable";

export type QuoteIssue = { productId: string; sku?: string; designId?: string; placement?: GarmentPlacement; code: QuoteIssueCode; message: string };

export type QuotedLine = {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  /** null when stock is not tracked for this SKU. */
  available: number | null;
  /** For category promotions (empty in the static catalog). */
  categoryId: string;
  /** Design printed on the base product, and its name as sold. */
  designId?: string;
  designName?: string;
  /** Where the design goes on the garment, with the base kind. */
  placement?: PlacedDesign;
};

export type CartQuote = {
  currency: Currency;
  lines: QuotedLine[];
  issues: QuoteIssue[];
  subtotalMinor: number;
  /** Shipping rules are not defined yet: never computed or promised. */
  shipping: { status: "pending" };
  /** True only when every requested line can be bought as requested. */
  valid: boolean;
};

export type QuoteDeps = {
  catalog: CatalogRepository;
  inventory: InventoryRepository;
  /** Without it (static catalog) every design line is rejected. */
  designs?: DesignOfferRepository;
};

const DESIGN_UNAVAILABLE = "Este diseño ya no está disponible en ese producto.";
const COLOR_UNAVAILABLE = "Ese color no está disponible para este diseño.";
const PLACEMENT_UNAVAILABLE = "Esa ubicación no está disponible para este producto.";

/**
 * Recomputes a cart on the server from catalog prices and availability.
 * Client-supplied prices are never read: the request only carries ids and
 * quantities. Duplicate lines for the same product, variant, design and placement are merged.
 */
export async function quoteCart(lines: readonly QuoteRequestLine[], deps: QuoteDeps): Promise<CartQuote> {
  // Same product, variant, design and placement → one line.
  const merged = new Map<string, { productId: string; sku?: string; designId?: string; placement?: GarmentPlacement; quantity: number }>();
  for (const line of lines) {
    const key = `${line.productId}|${line.sku ?? ""}|${line.designId ?? ""}|${placementKey(line.placement)}`;
    const current = merged.get(key);
    merged.set(key, {
      productId: line.productId,
      sku: line.sku,
      designId: line.designId,
      ...(line.placement ? { placement: line.placement } : {}),
      quantity: (current?.quantity ?? 0) + line.quantity,
    });
  }
  const requestedLines = [...merged.values()];
  const designIds = [...new Set(requestedLines.flatMap((line) => (line.designId ? [line.designId] : [])))];

  const [defaults, bySku, offers] = await Promise.all([
    deps.catalog.findVariantsByProductIds([...new Set(requestedLines.filter((line) => !line.sku).map((line) => line.productId))]),
    deps.catalog.findVariantsBySkus([...new Set(requestedLines.flatMap((line) => (line.sku ? [line.sku] : [])))]),
    designIds.length && deps.designs ? deps.designs.findOffers(designIds) : Promise.resolve(new Map<string, never>()),
  ]);
  // The design must be published and offered on a kind whose base product is this one;
  // the variant's color is checked once the variant is known.
  const designFor = (line: { productId: string; designId?: string }) => {
    if (!line.designId) return undefined;
    const offer = offers.get(line.designId);
    const base = offer?.bases.find((candidate) => candidate.productId === line.productId);
    return offer && base ? { id: offer.id, name: offer.name, base, lineName: designLineName(offer.name, base.kind) } : null;
  };
  const resolve = (line: { productId: string; sku?: string }) => {
    if (!line.sku) return defaults.get(line.productId);
    const variant = bySku.get(line.sku);
    // A SKU of another product is treated as unknown, never as that other product.
    return variant?.productId === line.productId ? variant : undefined;
  };
  const resolved = requestedLines.map((line) => ({ line, variant: resolve(line) }));
  const availability = await deps.inventory.getAvailability(resolved.flatMap(({ variant }) => (variant ? [variant.sku] : [])));

  const quoted: QuotedLine[] = [];
  const issues: QuoteIssue[] = [];
  // Lines of the same SKU (with and without a design) share its stock.
  const taken = new Map<string, number>();

  for (const { line, variant } of resolved) {
    const { productId, sku, placement, quantity: requested } = line;
    // Issues of a placed line carry its placement, so the cart can tell two placements apart.
    const placed = placement ? { placement } : {};
    const design = designFor(line);
    if (design === null) {
      issues.push({ productId, ...(sku ? { sku } : {}), designId: line.designId, ...placed, code: "design_unavailable", message: DESIGN_UNAVAILABLE });
      continue;
    }
    if (!variant || !variant.active) {
      issues.push({ productId, sku, code: "unknown_product", message: "El producto no existe o no está disponible." });
      continue;
    }
    if (design && !offersSku(design.base, variant.sku)) {
      issues.push({ productId, sku: variant.sku, designId: design.id, ...placed, code: "design_unavailable", message: COLOR_UNAVAILABLE });
      continue;
    }
    // Only garments take a free placement, and only on a side the kind has.
    if (design && placement && !(MOCKUPS[design.base.kind].freePlacement && MOCKUPS[design.base.kind].sides.includes(placement.side))) {
      issues.push({ productId, ...(sku ? { sku } : {}), designId: design.id, placement, code: "placement_unavailable", message: PLACEMENT_UNAVAILABLE });
      continue;
    }
    if (variant.hasOptions && !sku) {
      issues.push({ productId, code: "variant_required", message: "Elegí una opción (talle, color…) antes de comprar." });
      continue;
    }
    if (variant.requiresQuote) {
      issues.push({ productId, code: "requires_quote", message: "Este producto se cotiza a pedido." });
      continue;
    }
    if (!variant.purchasable || variant.unitPriceMinor === null) {
      issues.push({ productId, code: "not_purchasable", message: "Este producto no se puede comprar directamente." });
      continue;
    }

    const tracked = availability.get(variant.sku) ?? null;
    const available = tracked === null ? null : Math.max(0, tracked - (taken.get(variant.sku) ?? 0));
    let quantity = Math.min(requested, MAX_LINE_QUANTITY);
    if (available !== null && quantity > available) {
      issues.push({
        productId,
        ...(design ? { designId: design.id } : {}),
        ...placed,
        code: "insufficient_stock",
        message: available > 0 ? `Solo hay ${available} unidades disponibles.` : "Sin stock disponible.",
      });
      quantity = available;
    }
    if (quantity <= 0) continue;
    taken.set(variant.sku, (taken.get(variant.sku) ?? 0) + quantity);

    quoted.push({
      productId,
      sku: variant.sku,
      name: design ? design.lineName : variant.name,
      quantity,
      unitPriceMinor: variant.unitPriceMinor,
      lineTotalMinor: multiplyMinor(variant.unitPriceMinor, quantity),
      available,
      categoryId: variant.categoryId ?? "",
      ...(design ? { designId: design.id, designName: design.name } : {}),
      ...(design && placement ? { placement: { kind: design.base.kind, ...placement } } : {}),
    });
  }

  const subtotalMinor = quoted.reduce((total, line) => total + line.lineTotalMinor, 0);
  const capped = requestedLines.some((line) => line.quantity > MAX_LINE_QUANTITY);

  return {
    currency: DEFAULT_CURRENCY,
    lines: quoted,
    issues,
    subtotalMinor,
    shipping: { status: "pending" },
    valid: issues.length === 0 && !capped && quoted.length > 0,
  };
}
