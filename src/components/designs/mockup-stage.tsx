import Image from "next/image";
import type { MockupKind } from "@/lib/designs/kinds";
import { areaStyle, defaultPlacement, mockupTemplate, TEMPLATE_PX, type MockupSide, type MockupTone } from "@/lib/designs/mockups";

type Props = {
  kind: MockupKind;
  tone: MockupTone;
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
};

/**
 * A design laid over a base product template (same overlay as the T-shirt lab):
 * the template photo, the print area as a box, the design centred in it.
 * Pure markup, so it renders on the server (listing) and in the live preview.
 */
export function MockupStage({ kind, tone, side, imageUrl, width, height, alt, sizes, preload = false, className }: Props) {
  const template = mockupTemplate(kind, tone, side);
  const aspect = width > 0 && height > 0 ? width / height : 1;
  const placement = defaultPlacement(kind, aspect);
  const classes = ["mockup-stage__design", template.blend === "multiply" && "is-multiply", kind === "sticker" && "is-sticker"].filter(Boolean).join(" ");
  return (
    <div className={`mockup-stage${className ? ` ${className}` : ""}`} {...(alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true })}>
      <Image className="mockup-stage__photo" src={template.src} alt="" width={TEMPLATE_PX} height={TEMPLATE_PX} sizes={sizes} preload={preload} />
      <div className="mockup-stage__area" style={areaStyle(template.area)}>
        <Image
          className={classes}
          src={imageUrl}
          alt=""
          width={width || 1000}
          height={height || 1000}
          sizes={sizes}
          draggable={false}
          style={{ width: `${placement.scale * 100}%`, left: `${placement.x * 100}%`, top: `${placement.y * 100}%` }}
        />
      </div>
    </div>
  );
}
