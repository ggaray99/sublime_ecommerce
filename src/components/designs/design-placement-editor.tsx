"use client";

import { useId, useRef, useState, type ComponentProps, type PointerEvent as ReactPointerEvent } from "react";
import type { MockupKind } from "@/lib/designs/kinds";
import {
  clampGarmentPlacement,
  placedBox,
  placementHeightCm,
  TEMPLATE_PX,
  type GarmentPlacement,
  type MockupTemplate,
} from "@/lib/designs/mockups";
import { MockupStage } from "./mockup-stage";

const pct = (n: number) => `${(n / TEMPLATE_PX) * 100}%`;
const cm = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 1 });

type StageProps = Omit<ComponentProps<typeof MockupStage>, "placement" | "className"> & {
  /** The template shown (same kind, tone, side, overrides and color as the stage). */
  template: MockupTemplate;
  /** Already clamped for `template`. */
  placement: GarmentPlacement;
  aspect: number;
  /** Moves the design's centre to a point of the template, in template pixels. */
  onMoveTo: (center: { x: number; y: number }) => void;
};

/**
 * The mockup with a drag handle over the design: the customer can drag it
 * anywhere inside the template's garment zone. Keyboard users move it with the
 * sliders of PlacementControls; the handle itself is not focusable.
 */
export function PlacementStage({ template, placement, aspect, onMoveTo, ...stage }: StageProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const box = placedBox(stage.kind, template, placement, aspect);

  // Dragging fires many pointer events per frame: apply at most one move per frame.
  const pendingCenter = useRef<{ x: number; y: number } | null>(null);
  const moveOnNextFrame = (center: { x: number; y: number }) => {
    if (!pendingCenter.current) {
      requestAnimationFrame(() => {
        if (pendingCenter.current) onMoveTo(pendingCenter.current);
        pendingCenter.current = null;
      });
    }
    pendingCenter.current = center;
  };

  /** Pointer position in template pixels. */
  function pointerPosition(event: ReactPointerEvent) {
    const rect = layerRef.current!.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * TEMPLATE_PX, y: ((event.clientY - rect.top) / rect.height) * TEMPLATE_PX };
  }
  const stop = () => {
    drag.current = null;
    setDragging(false);
  };

  return (
    <div className="placement-stage">
      <MockupStage {...stage} placement={placement} />
      <div ref={layerRef} className={`placement-stage__layer${dragging ? " is-dragging" : ""}`}>
        <div
          className="placement-stage__garment"
          aria-hidden="true"
          style={{ left: pct(template.garment.left), top: pct(template.garment.top), width: pct(template.garment.width), height: pct(template.garment.height) }}
        />
        <div
          className="placement-stage__handle"
          aria-hidden="true"
          style={{ left: pct(box.left), top: pct(box.top), width: pct(box.width), height: pct(box.height) }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            const pos = pointerPosition(event);
            // Keep the grab point under the pointer: remember its offset from the design's centre.
            drag.current = { dx: pos.x - (box.left + box.width / 2), dy: pos.y - (box.top + box.height / 2) };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            const pos = pointerPosition(event);
            moveOnNextFrame({ x: pos.x - drag.current.dx, y: pos.y - drag.current.dy });
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
          onLostPointerCapture={stop}
        />
      </div>
    </div>
  );
}

type ControlsProps = {
  kind: MockupKind;
  template: MockupTemplate;
  /** Already clamped for `template`. */
  placement: GarmentPlacement;
  aspect: number;
  /** Receives a placement to store; it is clamped here before it is sent. */
  onChange: (next: GarmentPlacement) => void;
  onReset: () => void;
};

/** Size and position sliders in cm, "Centrar" and "Volver al lugar original". */
export function PlacementControls({ kind, template, placement, aspect, onChange, onReset }: ControlsProps) {
  const id = useId();
  const clamp = (patch: Partial<GarmentPlacement>) => clampGarmentPlacement(kind, template, { ...placement, ...patch }, aspect);
  const set = (patch: Partial<GarmentPlacement>) => onChange(clamp(patch));
  // Slider limits are what the clamp allows on this template.
  const widthMin = clamp({ widthCm: 0 }).widthCm;
  const widthMax = clamp({ widthCm: Number.MAX_SAFE_INTEGER }).widthCm;
  const xMax = clamp({ xCm: Number.MAX_SAFE_INTEGER }).xCm;
  const yMax = clamp({ yCm: Number.MAX_SAFE_INTEGER }).yCm;
  const heightCm = placementHeightCm(placement, aspect);

  return (
    <fieldset className="variant-options placement-controls">
      <legend>Ubicación del diseño</legend>
      <p className="muted">Arrastrá el diseño para ubicarlo donde quieras en la prenda.</p>
      <div className="field">
        <label htmlFor={`${id}-size`}>
          Tamaño: {cm(placement.widthCm)} cm de ancho × {cm(heightCm)} cm de alto
        </label>
        <input
          id={`${id}-size`}
          type="range"
          min={widthMin}
          max={widthMax}
          step={0.1}
          value={placement.widthCm}
          aria-valuetext={`${cm(placement.widthCm)} cm de ancho`}
          onChange={(e) => set({ widthCm: Number(e.currentTarget.value) })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-x`}>Posición horizontal</label>
        <input
          id={`${id}-x`}
          type="range"
          min={-xMax}
          max={xMax}
          step={0.1}
          value={placement.xCm}
          disabled={xMax === 0}
          aria-valuetext={placement.xCm === 0 ? "Centrado" : `${cm(Math.abs(placement.xCm))} cm hacia la ${placement.xCm < 0 ? "izquierda" : "derecha"}`}
          onChange={(e) => set({ xCm: Number(e.currentTarget.value) })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-y`}>Posición vertical</label>
        <input
          id={`${id}-y`}
          type="range"
          min={0}
          max={yMax}
          step={0.1}
          value={placement.yCm}
          disabled={yMax === 0}
          aria-valuetext={`${cm(placement.yCm)} cm desde el cuello`}
          onChange={(e) => set({ yCm: Number(e.currentTarget.value) })}
        />
      </div>
      <div className="placement-controls__actions">
        <button type="button" className="link-button" onClick={() => set({ xCm: 0 })}>
          Centrar
        </button>
        <button type="button" className="link-button" onClick={onReset}>
          Volver al lugar original
        </button>
      </div>
    </fieldset>
  );
}
