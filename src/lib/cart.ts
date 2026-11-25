import type { Product, ProductVariant } from "../data/products";
import { designLineName, type MockupKind } from "./designs/kinds.ts";
import { MOCKUP_SIDE_LABELS, parseGarmentPlacement, placementHeightCm, placementKey, type GarmentPlacement } from "./designs/mockups.ts";

/**
 * Only product ids, variant SKUs, design ids, placements and quantities are persisted: no personal data.
 * `sku` identifies the variant (size, color…) of products that have options;
 * `designId` the published design printed on a base product (mug, T-shirt…), and
 * `placement` where the customer placed it (side, size and position in cm).
 */
export type CartLine = { productId: string; quantity: number; sku?: string; designId?: string; placement?: GarmentPlacement };

export const MAX_QUANTITY = 99;

const DESIGN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const clamp = (quantity: number) => Math.min(MAX_QUANTITY, Math.max(1, Math.floor(quantity)));
/**
 * A line is a product + variant + design + placement: the same product with two
 * designs, or one design placed two ways, is two lines.
 */
const sameLine = (line: CartLine, productId: string, sku?: string, designId?: string, placement?: GarmentPlacement) =>
  line.productId === productId &&
  (line.sku ?? "") === (sku ?? "") &&
  (line.designId ?? "") === (designId ?? "") &&
  placementKey(line.placement) === placementKey(placement);

export function addLine(
  lines: readonly CartLine[],
  productId: string,
  quantity = 1,
  sku?: string,
  designId?: string,
  placement?: GarmentPlacement,
): CartLine[] {
  // A placement only means something with a design.
  const placed = designId && placement ? placement : undefined;
  const existing = lines.find((line) => sameLine(line, productId, sku, designId, placed));
  if (!existing) {
    return [
      ...lines,
      { productId, quantity: clamp(quantity), ...(sku ? { sku } : {}), ...(designId ? { designId } : {}), ...(placed ? { placement: { ...placed } } : {}) },
    ];
  }
  return lines.map((line) => (sameLine(line, productId, sku, designId, placed) ? { ...line, quantity: clamp(line.quantity + quantity) } : line));
}

export function setQuantity(
  lines: readonly CartLine[],
  productId: string,
  quantity: number,
  sku?: string,
  designId?: string,
  placement?: GarmentPlacement,
): CartLine[] {
  if (!Number.isFinite(quantity)) return [...lines];
  return lines.map((line) => (sameLine(line, productId, sku, designId, placement) ? { ...line, quantity: clamp(quantity) } : line));
}

export function removeLine(lines: readonly CartLine[], productId: string, sku?: string, designId?: string, placement?: GarmentPlacement): CartLine[] {
  return lines.filter((line) => !sameLine(line, productId, sku, designId, placement));
}

const isDesignId = (value: unknown) => typeof value === "string" && DESIGN_ID.test(value);

/** Parses persisted cart data defensively; anything malformed is dropped. */
export function parseCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (line): line is CartLine =>
          typeof line === "object" &&
          line !== null &&
          typeof (line as CartLine).productId === "string" &&
          typeof (line as CartLine).quantity === "number" &&
          Number.isFinite((line as CartLine).quantity) &&
          ((line as CartLine).sku === undefined || typeof (line as CartLine).sku === "string") &&
          // Lines saved before designs existed have no designId and stay valid.
          ((line as CartLine).designId === undefined || isDesignId((line as CartLine).designId)),
      )
      .map((line) => {
        // Lines saved before placements existed (or with a broken one) keep the design's standard spot.
        const placement = line.designId ? parseGarmentPlacement(line.placement) : null;
        return {
          productId: line.productId,
          quantity: clamp(line.quantity),
          ...(line.sku ? { sku: line.sku } : {}),
          ...(line.designId ? { designId: line.designId } : {}),
          ...(placement ? { placement } : {}),
        };
      });
  } catch {
    return [];
  }
}

/**
 * What the cart needs to show a design line (a subset of the storefront design);
 * `width`/`height` (the design file's pixels) give its printed height.
 */
export type CartDesign = { id: string; slug: string; name: string; imageUrl: string; width?: number; height?: number; bases: { kind: MockupKind; productId: string }[] };

/** Keeps only what the browser needs from a storefront design. */
export const toCartDesign = ({ id, slug, name, imageUrl, width, height, bases }: CartDesign): CartDesign => ({
  id,
  slug,
  name,
  imageUrl,
  ...(width && height ? { width, height } : {}),
  bases,
});

/** 25.3 → "25,3" (Argentine decimals). */
const cm = (n: number) => String(n).replace(".", ",");

/**
 * Where a placed design goes, in words for production: side, printed size
 * (width only when the design's aspect is unknown), horizontal offset from the
 * centre line (as seen) and distance below the collar.
 */
export function placementMeasures(placement: GarmentPlacement, aspect?: number) {
  const { widthCm, xCm, yCm } = placement;
  const size =
    aspect && aspect > 0 && Number.isFinite(aspect) ? `${cm(widthCm)} × ${cm(placementHeightCm(placement, aspect))} cm` : `${cm(widthCm)} cm de ancho`;
  return {
    side: MOCKUP_SIDE_LABELS[placement.side],
    size,
    horizontal: Math.abs(xCm) < 0.5 ? "centrado" : `${cm(Math.abs(xCm))} cm a la ${xCm < 0 ? "izquierda" : "derecha"} del centro`,
    vertical: `${cm(yCm)} cm debajo del cuello`,
  };
}

/** "Espalda · 20 × 25,3 cm"; without the design's aspect, "Espalda · 20 cm de ancho". */
export function placementSummary(placement: GarmentPlacement, aspect?: number): string {
  const { side, size } = placementMeasures(placement, aspect);
  return `${side} · ${size}`;
}

/** Stable key of a cart line (React lists). */
export const lineKey = (productId: string, sku?: string, designId?: string, placement?: GarmentPlacement) =>
  `${productId}|${sku ?? ""}|${designId ?? ""}|${placementKey(placement)}`;


export type CartItem = {
  product: Product;
  /** Design printed on the base product; `name` is the line name ("Gato astronauta · Remera clásica"). */
  design?: { id: string; slug: string; name: string; imageUrl: string; kind: MockupKind; aspect?: number };
  /** Where the customer placed the design (side, width and position in cm). */
  placement?: GarmentPlacement;
  /** Chosen variant of a product with options. */
  variant?: ProductVariant;
  /** "Talle M · Color Negro" */
  optionsLabel?: string;
  quantity: number;
  /** Unit price of the product or of its variant (ARS). */
  unitPrice: number;
  /** Available units of the product or variant; null/undefined when unknown or made to order. */
  stock?: number | null;
  lineTotal: number;
};

export type CartSummary = { items: CartItem[]; count: number; subtotal: number };

export const variantLabel = (product: Pick<Product, "optionNames">, variant: ProductVariant) =>
  (product.optionNames ?? [])
    .filter((name) => variant.options[name])
    .map((name) => `${name} ${variant.options[name]}`)
    .join(" · ");

/** The design of a line, when it is still published and offered on that product. */
function designOf(line: CartLine, designs: readonly CartDesign[]): CartItem["design"] | null {
  const design = designs.find((candidate) => candidate.id === line.designId);
  const base = design?.bases.find((candidate) => candidate.productId === line.productId);
  if (!design || !base) return null;
  const aspect = design.width && design.height ? design.width / design.height : undefined;
  return { id: design.id, slug: design.slug, name: designLineName(design.name, base.kind), imageUrl: design.imageUrl, kind: base.kind, ...(aspect ? { aspect } : {}) };
}

/**
 * Resolves lines against the catalog, ignoring unknown or quote-only products.
 * Products with options need a known variant SKU; lines without one are dropped.
 * Design lines need their design among `designs` (published, offered on that product).
 */
export function summarizeCart(lines: readonly CartLine[], catalog: readonly Product[], designs: readonly CartDesign[] = []): CartSummary {
  const items: CartItem[] = [];
  for (const line of lines) {
    const product = catalog.find((candidate) => candidate.id === line.productId);
    if (!product || !product.availableForDirectPurchase) continue;
    const design = line.designId ? designOf(line, designs) : undefined;
    if (design === null) continue;
    const placed = design && line.placement ? { placement: line.placement } : {};
    if (product.variants) {
      const variant = product.variants.find((candidate) => candidate.sku === line.sku);
      if (!variant || variant.price === null) continue;
      items.push({
        product,
        ...(design ? { design } : {}),
        ...placed,
        variant,
        optionsLabel: variantLabel(product, variant),
        quantity: line.quantity,
        unitPrice: variant.price,
        stock: variant.stock,
        lineTotal: variant.price * line.quantity,
      });
      continue;
    }
    if (product.price === null || line.sku) continue;
    items.push({ product, ...(design ? { design } : {}), ...placed, quantity: line.quantity, unitPrice: product.price, stock: product.stock, lineTotal: product.price * line.quantity });
  }
  return {
    items,
    count: items.reduce((total, item) => total + item.quantity, 0),
    subtotal: items.reduce((total, item) => total + item.lineTotal, 0),
  };
}
