import Image from "next/image";
import type { MockupKind } from "@/lib/designs/kinds";
import {
  areaStyle,
  defaultPlacement,
  designBox,
  mockupTemplate,
  TEMPLATE_PX,
  type MockupSide,
  type MockupTemplate,
  type MockupTone,
  type TemplateOverrides,
  type Warp,
} from "@/lib/designs/mockups";

type Props = {
  kind: MockupKind;
  tone: MockupTone;
  /** Garment color key (see colorKey): its own uploaded template wins over the tone's. */
  color?: string | null;
  side: MockupSide;
  imageUrl: string;
  /** Design file size in pixels: its aspect ratio decides how it fits the print area. */
  width: number;
  height: number;
  /** Accessible description of the whole mockup; empty = decorative. */
  alt: string;
  sizes: string;
  preload?: boolean;
  className?: string;
  /** Templates uploaded in Admin › Soportes, which replace the built-in ones. */
  overrides?: TemplateOverrides;
};

/**
 * A design laid over a base product template: the template photo, the print area
 * as a box, the design in it. Templates with a warp bend the design onto the
 * product (fabric folds, the mug's curve) with an SVG filter; the rest lay it flat.
 * Pure markup, so it renders on the server (listing) and in the live preview.
 */
export function MockupStage({ kind, tone, color, side, imageUrl, width, height, alt, sizes, preload = false, className, overrides }: Props) {
  const template = mockupTemplate(kind, tone, side, overrides, color);
  const aspect = width > 0 && height > 0 ? width / height : 1;
  const placement = defaultPlacement(kind, aspect);
  return (
    <div className={`mockup-stage${className ? ` ${className}` : ""}`} {...(alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true })}>
      <Image className="mockup-stage__photo" src={template.src} alt="" width={TEMPLATE_PX} height={TEMPLATE_PX} sizes={sizes} preload={preload} />
      {template.warp ? (
        <WarpedDesign template={template} warp={template.warp} imageUrl={imageUrl} box={designBox(kind, placement, aspect)} />
      ) : (
        <div className="mockup-stage__area" style={areaStyle(template.area)}>
          <Image
            className={["mockup-stage__design", template.blend === "multiply" && "is-multiply", kind === "sticker" && "is-sticker"].filter(Boolean).join(" ")}
            src={imageUrl}
            alt=""
            width={width || 1000}
            height={height || 1000}
            sizes={sizes}
            draggable={false}
            style={{ width: `${placement.scale * 100}%`, left: `${placement.x * 100}%`, top: `${placement.y * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

type WarpedProps = {
  template: MockupTemplate;
  warp: Warp;
  imageUrl: string;
  box: { left: number; top: number; width: number; height: number };
};

/**
 * The flat design drawn in the print area's pixels, then bent by the template's
 * displacement map, shaded with its light map (soft-light) and clipped to the
 * printable surface (the shade map's alpha). The filter id comes from the map,
 * so every card on a page that shares a template shares an identical filter.
 */
function WarpedDesign({ template, warp, imageUrl, box }: WarpedProps) {
  const { width: w, height: h } = template.area;
  const id = `warp-${warp.map.replace(/[^a-z0-9]+/gi, "-")}`;
  return (
    <svg
      className={`mockup-stage__warp${template.blend === "multiply" ? " is-multiply" : ""}`}
      style={areaStyle(template.area)}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id={id} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width={w} height={h} colorInterpolationFilters="sRGB">
          <feImage href={warp.map} x="0" y="0" width={w} height={h} preserveAspectRatio="none" result="map" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale={warp.scale} xChannelSelector="R" yChannelSelector="G" result="bent" />
          <feImage href={warp.shade} x="0" y="0" width={w} height={h} preserveAspectRatio="none" result="shade" />
          <feComposite in="shade" in2="bent" operator="in" result="shadeOnInk" />
          <feBlend in="shadeOnInk" in2="bent" mode="soft-light" result="lit" />
          <feComposite in="lit" in2="shade" operator="in" />
        </filter>
      </defs>
      <image
        href={imageUrl}
        x={box.left * w}
        y={box.top * h}
        width={box.width * w}
        height={box.height * h}
        preserveAspectRatio="none"
        filter={`url(#${id})`}
      />
    </svg>
  );
}
