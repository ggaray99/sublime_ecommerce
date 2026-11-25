import { MockupStage } from "@/components/designs/mockup-stage";
import { placementMeasures } from "@/lib/cart";
import { clampGarmentPlacement, colorKey, mockupTemplate, placedBox, toneOfColor, variantColor, type TemplateOverrides } from "@/lib/designs/mockups";
import type { OrderDesignArt, OrderItem } from "@/server/orders/repository";
import { MockupDownload } from "./mockup-download";

type Props = {
  item: OrderItem & { designPlacement: NonNullable<OrderItem["designPlacement"]> };
  /** The design's image; missing when the design no longer has one (only the measurements show). */
  art?: OrderDesignArt;
  /** Templates uploaded in Admin › Soportes (the same ones the store shows). */
  overrides: TemplateOverrides;
  /** Admin only: name of the JPG the "Descargar JPG" button saves. */
  downloadName?: string;
};

/**
 * Where the customer placed a catalog design: the mockup on the line's garment
 * color and the measurements to print it (side, size, horizontal offset and
 * distance below the collar). The stored placement is kept within the current
 * template's garment zone, which an admin may have changed since the order.
 */
export function DesignLineMockup({ item, art, overrides, downloadName }: Props) {
  const { kind, ...placement } = item.designPlacement;
  const aspect = art && art.width > 0 && art.height > 0 ? art.width / art.height : undefined;
  const measures = placementMeasures(placement, aspect);
  const color = variantColor(item.options);
  const template = mockupTemplate(kind, toneOfColor(color), placement.side, overrides, color ? colorKey(color) : null);
  const shown = art ? clampGarmentPlacement(kind, template, placement, aspect ?? 1) : null;
  const label = `${measures.side}, ${measures.size}, ${measures.horizontal}, ${measures.vertical}`;

  return (
    <div className="order-placement">
      {art && shown && (
        <div className="order-placement__mockup">
          <MockupStage
            kind={kind}
            tone={toneOfColor(color)}
            color={color ? colorKey(color) : null}
            side={placement.side}
            imageUrl={art.imageUrl}
            width={art.width}
            height={art.height}
            alt={`Vista previa: ${item.designName ?? item.name}, ${label}`}
            sizes="160px"
            overrides={overrides}
            placement={shown}
          />
        </div>
      )}
      <dl className="order-placement__measures">
        <div>
          <dt>Lado</dt>
          <dd>{measures.side}</dd>
        </div>
        <div>
          <dt>Tamaño</dt>
          <dd>{measures.size}</dd>
        </div>
        <div>
          <dt>Horizontal</dt>
          <dd>{measures.horizontal}</dd>
        </div>
        <div>
          <dt>Vertical</dt>
          <dd>{measures.vertical}</dd>
        </div>
      </dl>
      {downloadName && art && shown && (
        <MockupDownload
          templateSrc={template.src}
          multiply={template.blend === "multiply"}
          designSrc={art.imageUrl}
          box={placedBox(kind, template, shown, aspect ?? 1)}
          fileName={downloadName}
        />
      )}
      {!art && <p className="muted">Sin vista previa: el diseño ya no está disponible.</p>}
    </div>
  );
}
