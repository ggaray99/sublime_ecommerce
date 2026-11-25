"use client";

import { useId, useState } from "react";
import { cartActions } from "@/components/cart/cart-store";
import { QuantityStepper } from "@/components/cart/quantity-stepper";
import { showToast } from "@/components/cart/toast-store";
import type { ProductVariant } from "@/data/products";
import { MAX_QUANTITY } from "@/lib/cart";
import { MOCKUP_KIND_LABELS, type MockupKind } from "@/lib/designs/kinds";
import {
  clampGarmentPlacement,
  colorKey,
  MOCKUP_SIDE_LABELS,
  MOCKUPS,
  mockupTemplate,
  placementAt,
  startPlacement,
  toneOfVariant,
  variantColor,
  type GarmentPlacement,
  type MockupSide,
  type TemplateOverrides,
} from "@/lib/designs/mockups";
import { formatPrice } from "@/lib/format";
import { PlacementControls, PlacementStage } from "./design-placement-editor";
import { MockupStage } from "./mockup-stage";
import { SizeGuides, type KindSizeGuide } from "./size-guide";

/** A base product as the browser needs it: only what the pickers and the price use. */
export type DesignBaseOption = {
  kind: MockupKind;
  productId: string;
  optionNames: string[];
  variants: ProductVariant[];
  /** Only the variants in colors enabled for the design. Products without variants: their own price and stock. */
  price: number | null;
  stock: number | null | undefined;
  purchasable: boolean;
};

type Props = {
  design: { id: string; name: string; imageUrl: string; width: number; height: number; opaque: boolean };
  bases: DesignBaseOption[];
  /** Templates uploaded in Admin › Soportes. */
  overrides?: TemplateOverrides;
  /** Size guides by kind (Admin › Soportes); only the selected kind's is shown. */
  sizeGuides?: Partial<Record<MockupKind, KindSizeGuide>>;
};

const inStock = (stock: number | null | undefined) => stock === undefined || stock === null || stock > 0;
const matches = (variant: ProductVariant, selection: Record<string, string>) =>
  Object.entries(selection).every(([name, value]) => variant.options[name] === value);
const firstSelection = (base: DesignBaseOption) => ({ ...((base.variants.find((v) => inStock(v.stock)) ?? base.variants[0])?.options ?? {}) });

/**
 * Live preview of a design on each base product it is sold on, with the base
 * product's options (talle, color…), price and stock, and the add-to-cart button.
 */
export function DesignMockup({ design, bases, overrides, sizeGuides }: Props) {
  const id = useId();
  const [kind, setKind] = useState<MockupKind>(bases[0].kind);
  const [side, setSide] = useState<MockupSide>("front");
  const [selections, setSelections] = useState<Partial<Record<MockupKind, Record<string, string>>>>({});
  const [quantity, setQuantity] = useState(1);
  /** Where the customer placed the design, in cm, per kind and side (`${kind}-${side}`); absent = the side's starting spot. */
  const [placements, setPlacements] = useState<Record<string, GarmentPlacement>>({});

  const base = bases.find((candidate) => candidate.kind === kind) ?? bases[0];
  const selection = selections[base.kind] ?? firstSelection(base);
  const hasVariants = base.variants.length > 0;
  const variant = hasVariants
    ? base.variants.find((candidate) => matches(candidate, selection) && Object.keys(candidate.options).length === base.optionNames.length)
    : undefined;
  const values = (name: string) => [...new Set(base.variants.map((candidate) => candidate.options[name]).filter(Boolean))];
  const available = (name: string, value: string) =>
    base.variants.some((candidate) => candidate.options[name] === value && inStock(candidate.stock) && matches(candidate, { ...selection, [name]: value }));

  const choose = (name: string, value: string) => {
    const next = { ...selection, [name]: value };
    // A combination that does not exist keeps the new value and takes the first variant that has it.
    const resolved = base.variants.some((candidate) => matches(candidate, next))
      ? next
      : { ...((base.variants.find((c) => c.options[name] === value && inStock(c.stock)) ?? base.variants.find((c) => c.options[name] === value))?.options ?? next) };
    setSelections((current) => ({ ...current, [base.kind]: resolved }));
  };

  const sides = MOCKUPS[base.kind].sides;
  const shownSide = sides.includes(side) ? side : sides[0];
  const tone = toneOfVariant(selection);
  const color = colorKey(variantColor(selection) ?? "") || null;
  const kindLabel = MOCKUP_KIND_LABELS[base.kind];
  const lineName = `${design.name} · ${kindLabel}`;
  const optionLabel = base.optionNames.map((name) => `${name} ${selection[name]}`).join(" · ");

  // Free placement (garments): one placement per kind and side, kept in cm and
  // clamped to the template shown, so a color change keeps it where it fits.
  const freePlacement = MOCKUPS[base.kind].freePlacement;
  const template = mockupTemplate(base.kind, tone, shownSide, overrides, color);
  const aspect = design.width > 0 && design.height > 0 ? design.width / design.height : 1;
  const placementSlot = `${base.kind}-${shownSide}`;
  const startingPlacement = () => startPlacement(base.kind, template, shownSide, aspect);
  const placement = freePlacement
    ? clampGarmentPlacement(base.kind, template, placements[placementSlot] ?? startingPlacement(), aspect)
    : undefined;
  const updatePlacement = (next: (current: GarmentPlacement) => GarmentPlacement) =>
    setPlacements((all) => {
      const current = clampGarmentPlacement(base.kind, template, all[placementSlot] ?? startingPlacement(), aspect);
      return { ...all, [placementSlot]: next(current) };
    });

  const price = hasVariants ? (variant?.price ?? null) : base.price;
  const stock = hasVariants ? variant?.stock : base.stock;
  const exists = !hasVariants || Boolean(variant);
  const canBuy = base.purchasable && exists && price !== null && inStock(stock);
  const maxQuantity = typeof stock === "number" && stock > 0 ? Math.min(MAX_QUANTITY, stock) : MAX_QUANTITY;

  const stageProps = {
    kind: base.kind,
    tone,
    color,
    side: shownSide,
    imageUrl: design.imageUrl,
    width: design.width,
    height: design.height,
    alt: `${design.name} en ${kindLabel.toLowerCase()}${sides.length > 1 ? `, ${MOCKUP_SIDE_LABELS[shownSide].toLowerCase()}` : ""}`,
    sizes: "(max-width: 899px) 100vw, 560px",
    preload: true,
    overrides,
  };

  return (
    <div className="design-detail">
      <div className="design-detail__preview">
        {placement ? (
          <PlacementStage
            {...stageProps}
            template={template}
            placement={placement}
            aspect={aspect}
            onMoveTo={(center) => updatePlacement((current) => placementAt(base.kind, template, current, aspect, center))}
          />
        ) : (
          <MockupStage {...stageProps} className="mockup-stage--large" />
        )}
        <p className="fine-print">Vista previa ilustrativa: el estampado final puede variar levemente en tamaño y color.</p>
      </div>

      <div className="design-detail__controls variant-purchase">
        {bases.length > 1 && (
          <fieldset className="variant-options">
            <legend>
              Producto: <strong>{kindLabel}</strong>
            </legend>
            <div className="variant-options__values">
              {bases.map((candidate) => {
                const inputId = `${id}-kind-${candidate.kind}`;
                return (
                  <span key={candidate.kind} className="variant-option">
                    <input
                      id={inputId}
                      type="radio"
                      name={`${id}-kind`}
                      value={candidate.kind}
                      checked={candidate.kind === base.kind}
                      onChange={() => setKind(candidate.kind)}
                    />
                    <label htmlFor={inputId}>{MOCKUP_KIND_LABELS[candidate.kind]}</label>
                  </span>
                );
              })}
            </div>
          </fieldset>
        )}

        {sides.length > 1 && (
          <fieldset className="variant-options">
            <legend>
              Estampa en: <strong>{MOCKUP_SIDE_LABELS[shownSide]}</strong>
            </legend>
            <div className="variant-options__values">
              {sides.map((candidate) => {
                const inputId = `${id}-side-${candidate}`;
                return (
                  <span key={candidate} className="variant-option">
                    <input id={inputId} type="radio" name={`${id}-side`} value={candidate} checked={candidate === shownSide} onChange={() => setSide(candidate)} />
                    <label htmlFor={inputId}>{MOCKUP_SIDE_LABELS[candidate]}</label>
                  </span>
                );
              })}
            </div>
          </fieldset>
        )}

        {base.optionNames.map((name) => (
          <fieldset key={`${base.kind}-${name}`} className="variant-options">
            <legend>
              {name}: <strong>{selection[name]}</strong>
            </legend>
            <div className="variant-options__values">
              {values(name).map((value) => {
                const inputId = `${id}-${base.kind}-${name}-${value}`;
                const unavailable = !available(name, value);
                return (
                  <span key={value} className="variant-option">
                    <input
                      id={inputId}
                      type="radio"
                      name={`${id}-${base.kind}-${name}`}
                      value={value}
                      checked={selection[name] === value}
                      onChange={() => choose(name, value)}
                    />
                    <label htmlFor={inputId} className={unavailable ? "is-unavailable" : undefined}>
                      {value}
                      {unavailable && <span className="visually-hidden"> (sin stock)</span>}
                    </label>
                  </span>
                );
              })}
            </div>
          </fieldset>
        ))}

        {placement && (
          <PlacementControls
            kind={base.kind}
            template={template}
            placement={placement}
            aspect={aspect}
            onChange={(next) => updatePlacement(() => next)}
            onReset={() => updatePlacement(() => startingPlacement())}
          />
        )}

        <p className="product-detail__price" aria-live="polite">
          {variant?.regularPrice && (
            <s className="price-was">
              <span className="visually-hidden">Antes </span>
              {formatPrice(variant.regularPrice)}
            </s>
          )}
          {price !== null ? formatPrice(price) : "—"}
          {variant?.regularPrice && <span className="badge badge--sale">Oferta</span>}
        </p>
        <p className={`stock-note ${exists && inStock(stock) ? "stock-note--in" : "stock-note--out"}`} aria-live="polite">
          {!exists
            ? "Esa combinación no está disponible."
            : stock === undefined
              ? null
              : stock === null
                ? "Se fabrica a pedido."
                : stock > 0
                  ? `Stock disponible: ${stock} ${stock === 1 ? "unidad" : "unidades"}`
                  : "Sin stock en esta opción."}
        </p>
        {design.opaque && <p className="muted">Este diseño se imprime con su fondo.</p>}

        {canBuy ? (
          <div className="purchase">
            <QuantityStepper
              label={`Cantidad de ${lineName}${optionLabel ? ` (${optionLabel})` : ""}`}
              value={Math.min(quantity, maxQuantity)}
              min={1}
              max={maxQuantity}
              onChange={setQuantity}
            />
            <button
              type="button"
              className="btn btn--acid btn--lg"
              onClick={() => {
                const amount = Math.min(quantity, maxQuantity);
                cartActions.add(base.productId, amount, variant?.sku, design.id, placement);
                showToast(`${amount > 1 ? `${amount} × ` : ""}${lineName}${optionLabel ? ` (${optionLabel})` : ""} se sumó al carrito.`);
              }}
            >
              Agregar al carrito
            </button>
          </div>
        ) : (
          exists &&
          !base.purchasable && (
            <div className="purchase purchase--quote">
              <p>Este producto no está disponible para comprar en este momento.</p>
            </div>
          )
        )}
        <SizeGuides guides={sizeGuides?.[kind] ? [sizeGuides[kind]] : []} />
      </div>
    </div>
  );
}
