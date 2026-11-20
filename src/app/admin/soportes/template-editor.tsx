"use client";

import Image from "next/image";
import { useActionState, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Status } from "@/components/admin/forms";
import { areaStyle, fitTemplateArea, MIN_AREA_PX, TEMPLATE_PX, type Box, type TemplateSlot } from "@/lib/designs/mockups";
import { resetTemplateAction, saveTemplateAreaAction, uploadTemplatePhotoAction } from "./actions";

type Props = {
  slot: TemplateSlot;
  /** "Blanco · Frente". */
  label: string;
  src: string;
  area: Box;
  /** True when the slot uses an uploaded photo (only those have an editable print area). */
  custom: boolean;
  /** Mug only, 0–1. */
  curve: number | null;
  storage: boolean;
};

function SlotFields({ slot }: { slot: TemplateSlot }) {
  return (
    <>
      <input type="hidden" name="kind" value={slot.kind} />
      <input type="hidden" name="tone" value={slot.tone} />
      <input type="hidden" name="side" value={slot.side} />
    </>
  );
}

/** One template of a kind (a color and a side): its image, the print area and the forms that change them. */
export function TemplateEditor({ slot, label, src, area, custom, curve, storage }: Props) {
  const id = useId();
  const [box, setBox] = useState(area);
  const [curvePct, setCurvePct] = useState(Math.round((curve ?? 0.7) * 100));
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [uploadState, upload, uploading] = useActionState(uploadTemplatePhotoAction, {});
  const [areaState, saveArea, savingArea] = useActionState(saveTemplateAreaAction, {});
  const [resetState, reset] = useActionState(resetTemplateAction, {});
  const maxWidth = fitTemplateArea(slot.kind, { left: 0, top: 0, width: TEMPLATE_PX }).width;
  const moved = box.left !== area.left || box.top !== area.top || box.width !== area.width || (curve !== null && curvePct !== Math.round(curve * 100));

  const move = (left: number, top: number, width = box.width) => setBox(fitTemplateArea(slot.kind, { left, top, width }));

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, left: box.left, top: box.top };
  }

  function endDrag() {
    drag.current = null;
  }

  function onDrag(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    const width = stage.current?.clientWidth;
    if (!start || !width) return;
    const ratio = TEMPLATE_PX / width;
    move(start.left + (event.clientX - start.x) * ratio, start.top + (event.clientY - start.y) * ratio);
  }

  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 20 : 4;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!delta) return;
    event.preventDefault();
    move(box.left + delta[0], box.top + delta[1]);
  }

  return (
    <article className="template-editor" aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`} className="template-editor__title">
        {label}
        <span className={`badge ${custom ? "badge--ok" : "badge--pending"}`}>{custom ? "Foto propia" : "Imagen original"}</span>
      </h4>
      <div ref={stage} className="template-editor__stage">
        <Image src={src} alt="" width={TEMPLATE_PX} height={TEMPLATE_PX} sizes="320px" className="template-editor__photo" />
        {custom ? (
          <button
            type="button"
            className="template-editor__area is-editable"
            style={areaStyle(box)}
            aria-label={`Zona de estampa (izquierda ${box.left} px, arriba ${box.top} px, ancho ${box.width} px): arrastrala o movela con las flechas`}
            onPointerDown={startDrag}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKey}
          >
            <span aria-hidden="true">Estampa</span>
          </button>
        ) : (
          <div className="template-editor__area" style={areaStyle(box)} aria-hidden="true">
            <span>Estampa</span>
          </div>
        )}
      </div>

      {custom && (
        <form action={saveArea} className="quote-form template-editor__form">
          <Status state={areaState} />
          <SlotFields slot={slot} />
          <input type="hidden" name="left" value={box.left} />
          <input type="hidden" name="top" value={box.top} />
          <div className="field">
            <label htmlFor={`${id}-width`}>Tamaño de la zona de estampa</label>
            <input
              id={`${id}-width`}
              name="width"
              type="range"
              min={MIN_AREA_PX}
              max={maxWidth}
              value={box.width}
              onChange={(event) => move(box.left, box.top, Number(event.currentTarget.value))}
            />
          </div>
          {slot.kind === "mug" && (
            <div className="field">
              <label htmlFor={`${id}-curve`}>Curva de la taza: {curvePct} %</label>
              <input
                id={`${id}-curve`}
                name="curve"
                type="range"
                min={0}
                max={100}
                value={curvePct}
                onChange={(event) => setCurvePct(Number(event.currentTarget.value))}
                aria-describedby={`${id}-curve-hint`}
              />
              <p className="field__hint" id={`${id}-curve-hint`}>
                0 % = el diseño queda plano; más alto = se envuelve más alrededor de la taza.
              </p>
            </div>
          )}
          <button type="submit" className="btn btn--coal" disabled={savingArea || !moved}>
            {savingArea ? "Guardando…" : "Guardar zona de estampa"}
          </button>
        </form>
      )}

      {storage ? (
        <form action={upload} className="quote-form template-editor__form">
          <Status state={uploadState} />
          <SlotFields slot={slot} />
          <div className="field">
            <label htmlFor={`${id}-file`}>{custom ? "Cambiar foto" : "Subir foto propia"}</label>
            <input
              id={`${id}-file`}
              name="file"
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              required
              aria-invalid={Boolean(uploadState.fields?.file)}
              aria-describedby={`${id}-file-hint${uploadState.fields?.file ? ` ${id}-file-error` : ""}`}
            />
            <p className="field__hint" id={`${id}-file-hint`}>
              PNG con fondo transparente o foto con fondo blanco liso (el fondo blanco se recorta solo). Cuadrada y de 1080 px o más; hasta 15 MB.
            </p>
            {uploadState.fields?.file && (
              <p className="field__error" id={`${id}-file-error`}>
                {uploadState.fields.file}
              </p>
            )}
          </div>
          <button type="submit" className="btn btn--ghost" disabled={uploading}>
            {uploading ? "Subiendo…" : "Subir foto"}
          </button>
        </form>
      ) : (
        <p className="muted">La carga de imágenes no está configurada en este entorno (falta MEDIA_ROOT).</p>
      )}

      {custom && (
        <form action={reset}>
          <Status state={resetState} />
          <SlotFields slot={slot} />
          <ConfirmButton message={`¿Volver a la imagen original de ${label.toLowerCase()}? La foto subida se borra.`}>
            Volver a la imagen original
          </ConfirmButton>
        </form>
      )}
    </article>
  );
}
