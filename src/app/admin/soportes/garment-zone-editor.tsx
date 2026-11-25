"use client";

import { useActionState, useId, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { Status } from "@/components/admin/forms";
import { areaStyle, TEMPLATE_PX, type Box, type TemplateSlot } from "@/lib/designs/mockups";
import { saveTemplateGarmentAction } from "./actions";

/** Black dashes, so the garment zone reads apart from the cyan print area it holds. */
const ZONE_STYLE: CSSProperties = { position: "absolute", border: "2px dashed var(--black)", pointerEvents: "none" };
const MOVE_STYLE: CSSProperties = { position: "absolute", inset: 0, padding: 0, border: 0, background: "transparent", cursor: "move" };
const LABEL_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  padding: "1px 4px",
  background: "var(--black)",
  color: "var(--white)",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
};
const HANDLE_STYLE: CSSProperties = {
  position: "absolute",
  right: -8,
  bottom: -8,
  width: 16,
  height: 16,
  padding: 0,
  border: "2px solid var(--white)",
  background: "var(--black)",
  cursor: "nwse-resize",
  pointerEvents: "auto",
};

type Drag = { x: number; y: number; zone: Box; mode: "move" | "resize" };

/**
 * The garment zone over an uploaded photo: where the customer can move a design.
 * Drag it to move it and the corner handle to resize it (width and height apart);
 * with the keyboard, arrows move it and Shift + arrows resize it. `zone` is what
 * is shown (already fitted around the print area); `onChange` gets the raw box.
 */
export function GarmentZoneBox({ zone, stage, onChange }: { zone: Box; stage: RefObject<HTMLDivElement | null>; onChange: (box: Box) => void }) {
  const drag = useRef<Drag | null>(null);

  // The button's data-mode says whether it moves or resizes the zone.
  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const mode = event.currentTarget.dataset.mode === "resize" ? "resize" : "move";
    drag.current = { x: event.clientX, y: event.clientY, zone, mode };
  }

  function onDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    const width = stage.current?.clientWidth;
    if (!current || !width) return;
    const ratio = TEMPLATE_PX / width;
    const dx = (event.clientX - current.x) * ratio;
    const dy = (event.clientY - current.y) * ratio;
    const { left, top, width: w, height: h } = current.zone;
    onChange(current.mode === "move" ? { left: left + dx, top: top + dy, width: w, height: h } : { left, top, width: w + dx, height: h + dy });
  }

  function endDrag() {
    drag.current = null;
  }

  // Arrows move the zone; Shift + arrows (or arrows on the corner handle) resize it.
  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    const step = 8;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const [dx, dy] = delta;
    const resize = event.shiftKey || event.currentTarget.dataset.mode === "resize";
    onChange(resize ? { ...zone, width: zone.width + dx, height: zone.height + dy } : { ...zone, left: zone.left + dx, top: zone.top + dy });
  }

  const size = `izquierda ${zone.left} px, arriba ${zone.top} px, ancho ${zone.width} px, alto ${zone.height} px`;
  const handlers = { onPointerDown: startDrag, onPointerMove: onDrag, onPointerUp: endDrag, onPointerCancel: endDrag, onKeyDown: onKey };
  return (
    <div style={{ ...ZONE_STYLE, ...areaStyle(zone) }}>
      <button
        type="button"
        style={{ ...MOVE_STYLE, pointerEvents: "auto" }}
        aria-label={`Zona de la prenda (${size}): arrastrala o movela con las flechas; Mayús + flechas cambia el tamaño`}
        data-mode="move"
        {...handlers}
      >
        <span aria-hidden="true" style={LABEL_STYLE}>
          Prenda
        </span>
      </button>
      <button
        type="button"
        style={HANDLE_STYLE}
        aria-label={`Tamaño de la zona de la prenda (ancho ${zone.width} px, alto ${zone.height} px): arrastralo o usá las flechas`}
        data-mode="resize"
        {...handlers}
      />
    </div>
  );
}

/**
 * Saves the garment zone of an uploaded photo, or goes back to the automatic one.
 * `saved` is the zone in effect now; `own` is true when the admin set it.
 */
export function GarmentZoneForm({ slot, zone, saved, own }: { slot: TemplateSlot; zone: Box; saved: Box; own: boolean }) {
  const id = useId();
  const [state, save, saving] = useActionState(saveTemplateGarmentAction, {});
  const changed = zone.left !== saved.left || zone.top !== saved.top || zone.width !== saved.width || zone.height !== saved.height;
  return (
    <form action={save} className="quote-form template-editor__form" aria-describedby={`${id}-hint`}>
      <Status state={state} />
      <input type="hidden" name="kind" value={slot.kind} />
      <input type="hidden" name="tone" value={slot.tone} />
      <input type="hidden" name="side" value={slot.side} />
      <input type="hidden" name="left" value={zone.left} />
      <input type="hidden" name="top" value={zone.top} />
      <input type="hidden" name="width" value={zone.width} />
      <input type="hidden" name="height" value={zone.height} />
      <p className="field__hint" id={`${id}-hint`}>
        Zona de la prenda (recuadro negro): el cliente puede mover el diseño a cualquier lugar dentro de ella. La zona de estampa sigue marcando dónde
        arranca el diseño y las medidas en cm. {own ? "Esta foto usa una zona propia." : "Ahora se usa la zona automática."}
      </p>
      <button type="submit" name="intent" value="save" className="btn btn--coal" disabled={saving || !changed}>
        {saving ? "Guardando…" : "Guardar zona de la prenda"}
      </button>
      {own && (
        <button type="submit" name="intent" value="auto" className="btn btn--ghost" disabled={saving}>
          Usar zona automática
        </button>
      )}
    </form>
  );
}
