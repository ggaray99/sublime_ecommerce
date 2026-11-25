"use client";

import { useState } from "react";
import { TEMPLATE_PX, type Box } from "@/lib/designs/mockups";

type Props = {
  /** Template photo and design image (same-origin /media or /mockups, or public storage with CORS). */
  templateSrc: string;
  designSrc: string;
  /** Light garments whose template multiplies the design onto the fabric. */
  multiply: boolean;
  /** The design's rectangle on the template, in template pixels (placedBox). */
  box: Box;
  fileName: string;
};

/** Loads an image for the canvas; crossOrigin keeps the canvas exportable when it comes from storage. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    image.src = src;
  });
}

/**
 * Admin: saves the line's mockup as a JPG (TEMPLATE_PX square, white background):
 * the template photo with the design laid flat where the customer placed it.
 */
export function MockupDownload({ templateSrc, designSrc, multiply, box, fileName }: Props) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function download() {
    setState("busy");
    try {
      const [photo, design] = await Promise.all([loadImage(templateSrc), loadImage(designSrc)]);
      const canvas = document.createElement("canvas");
      canvas.width = TEMPLATE_PX;
      canvas.height = TEMPLATE_PX;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas no disponible");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, TEMPLATE_PX, TEMPLATE_PX);
      context.drawImage(photo, 0, 0, TEMPLATE_PX, TEMPLATE_PX);
      if (multiply) context.globalCompositeOperation = "multiply";
      context.drawImage(design, box.left, box.top, box.width, box.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("No se pudo exportar");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <p className="order-placement__download">
      <button type="button" className="btn btn--ghost" onClick={download} disabled={state === "busy"} aria-busy={state === "busy"}>
        {state === "busy" ? "Generando…" : "Descargar JPG"}
      </button>
      {state === "error" && (
        <span className="field__error" role="status">
          {" "}
          No se pudo generar la imagen. Probá de nuevo.
        </span>
      )}
    </p>
  );
}
