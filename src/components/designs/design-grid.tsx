import Link from "next/link";
import { MOCKUP_KIND_LABELS } from "@/lib/designs/kinds";
import { defaultDesignFilters, matchingBase, type DesignCardFacets, type DesignFilters } from "@/lib/designs/catalog-filters";
import { toneOfColor, type TemplateOverrides } from "@/lib/designs/mockups";
import { formatPrice } from "@/lib/format";
import { MockupStage } from "./mockup-stage";

/** A published design as the catalog grid shows it. */
export type DesignCard = DesignCardFacets & {
  id: string;
  slug: string;
  name: string;
  categoryLabel?: string | null;
  imageUrl: string;
  width: number;
  height: number;
  /** Lowest price among its base products; null = on quote. */
  from: number | null;
};

type Props = { cards: DesignCard[]; overrides: TemplateOverrides; filters?: DesignFilters };

/**
 * The design cards. Each one previews the base product and color that match the
 * filters (the first base product and its first enabled color without filters).
 */
export function DesignGrid({ cards, overrides, filters = defaultDesignFilters }: Props) {
  return (
    <ul className="product-grid design-grid">
      {cards.map((card, index) => {
        const base = matchingBase(card, filters) ?? card.bases[0];
        const color = base.colors.find(({ key }) => key === filters.color) ?? base.colors[0] ?? null;
        const href = `/disenos/${card.slug}`;
        return (
          <li key={card.id}>
            <article className="product-card design-card">
              <Link href={href} className="product-card__media design-card__media" tabIndex={-1} aria-hidden="true">
                <MockupStage
                  kind={base.kind}
                  tone={toneOfColor(color?.label ?? null)}
                  color={color?.key ?? null}
                  side="front"
                  imageUrl={card.imageUrl}
                  width={card.width}
                  height={card.height}
                  alt=""
                  sizes="(max-width: 359px) 100vw, (max-width: 639px) 50vw, (max-width: 1199px) 33vw, 25vw"
                  preload={index < 4}
                  overrides={overrides}
                />
              </Link>
              <div className="product-card__body">
                {card.categoryLabel && <p className="product-card__category">{card.categoryLabel}</p>}
                <h2 className="product-card__title">
                  <Link href={href}>{card.name}</Link>
                </h2>
                <p className="design-card__kinds">Disponible en: {card.bases.map(({ kind }) => MOCKUP_KIND_LABELS[kind]).join(", ")}</p>
                <p className="product-card__price">{card.from === null ? "A presupuestar" : `Desde ${formatPrice(card.from)}`}</p>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
