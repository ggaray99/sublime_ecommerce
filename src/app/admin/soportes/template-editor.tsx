"use client";

import Image from "next/image";
import { useActionState, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Status } from "@/components/admin/forms";
import { MockupStage } from "@/components/designs/mockup-stage";
import type { MockupKind } from "@/lib/designs/kinds";
import {
  areaStyle,
  DEFAULT_MUG_CURVE,
  fitTemplateArea,
  MIN_AREA_PX,
  MOCKUP_SIDE_LABELS,
  slotKey,
  slotTone,
  TEMPLATE_PX,
  type Box,
  type MockupSide,
  type MockupTone,
  type TemplateOverrides,
  type TemplateSlot,
  type Warp,
} from "@/lib/designs/mockups";
import { resetTemplateAction, saveTemplateAreaAction, uploadTemplatePhotoAction } from "./actions";

/** What the page knows about one template slot. */
export type SlotView = {
  slot: TemplateSlot;
  src: string;
  area: Box;
  warp?: Warp;
  /** True when the slot uses an uploaded photo (only those have an editable print area). */
  custom: boolean;
  /** Mug only, 0–1. */
  curve: number | null;
  /** A color without its own photo: what the store shows instead, e.g. "Sin foto propia: se muestra la base oscura." */
  fallback: string | null;
};

/** One entry of the Color picker: a garment color key (its own photo) or a generic light/dark template. */
export type ToneOption = { value: string; label: string; color: boolean };

/** A demo design for the preview, in the version made for light or dark products. */
const SAMPLE = { width: 2400, height: 3040, src: (tone: MockupTone) => `/lab/designs/gato-mutante-${tone === "dark" ? "oscuro" : "claro"}.png` };

function SlotFields({ slot }: { slot: TemplateSlot }) {
  return (
    <>
      <input type="hidden" name="kind" value={slot.kind} />
      <input type="hidden" name="tone" value={slot.tone} />
      <input type="hidden" name="side" value={slot.side} />
    </>
  );
}

function Picker<T extends string>({ legend, value, options, labels, onChange }: { legend: string; value: T; options: readonly T[]; labels: Record<T, string>; onChange: (value: T) => void }) {
  const id = useId();
  return (
    <fieldset className="variant-options">
      <legend>
        {legend}: <strong>{labels[value]}</strong>
      </legend>
      <div className="variant-options__values">
        {options.map((option) => (
          <span key={option} className="variant-option">
            <input id={`${id}-${option}`} type="radio" name={id} value={option} checked={option === value} onChange={() => onChange(option)} />
            <label htmlFor={`${id}-${option}`}>{labels[option]}</label>
          </span>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Admin page of one base kind's images: pick the color and side, then change its
 * photo, mark the print area and see a demo design on it, like a design's page.
 */
export function TemplateWorkspace({ kind, tones, slots, storage }: { kind: MockupKind; tones: ToneOption[]; slots: SlotView[]; storage: boolean }) {
  const toneValues = tones.map((option) => option.value);
  const toneLabels = Object.fromEntries(tones.map((option) => [option.value, option.label]));
  const sides = [...new Set(slots.map(({ slot }) => slot.side))];
  const [tone, setTone] = useState<string>(toneValues[0]);
  const [side, setSide] = useState<MockupSide>(sides[0]);
  const view = slots.find(({ slot }) => slot.tone === tone && slot.side === side) ?? slots[0];
  const color = tones.find((option) => option.value === view.slot.tone)?.color ?? false;
  return (
    <div className="template-workspace">
      {(tones.length > 1 || sides.length > 1) && (
        <div className="template-workspace__pickers">
          {tones.length > 1 && <Picker legend="Color" value={tone} options={toneValues} labels={toneLabels} onChange={setTone} />}
          {sides.length > 1 && <Picker legend="Lado" value={side} options={sides} labels={MOCKUP_SIDE_LABELS} onChange={setSide} />}
        </div>
      )}
      <TemplateEditor
        // A new photo, a saved area or another slot starts the editor over from the stored values.
        key={`${slotKey(view.slot)}-${view.src}-${view.area.left}-${view.area.top}-${view.area.width}-${view.curve ?? ""}`}
        kind={kind}
        view={view}
        toneLabel={toneLabels[view.slot.tone] ?? view.slot.tone}
        color={color}
        storage={storage}
      />
    </div>
  );
}

/** One template: its photo with the draggable print area, a preview with a demo design and the forms that change it. */
function TemplateEditor({ kind, view, toneLabel, color, storage }: { kind: MockupKind; view: SlotView; toneLabel: string; color: boolean; storage: boolean }) {
  const { slot, src, area, custom, curve, fallback } = view;
  const id = useId();
  const [box, setBox] = useState(area);
  const [curvePct, setCurvePct] = useState(Math.round((curve ?? DEFAULT_MUG_CURVE) * 100));
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [uploadState, upload, uploading] = useActionState(uploadTemplatePhotoAction, {});
  const [areaState, saveArea, savingArea] = useActionState(saveTemplateAreaAction, {});
  const [resetState, reset] = useActionState(resetTemplateAction, {});
  const maxWidth = fitTemplateArea(kind, { left: 0, top: 0, width: TEMPLATE_PX }).width;
  const changed = box.left !== area.left || box.top !== area.top || box.width !== area.width || (curve !== null && curvePct !== Math.round(curve * 100));
  const label = `${toneLabel} · ${MOCKUP_SIDE_LABELS[slot.side]}`;
  // A color previews on its light/dark base, with the photo shown here standing in for that base.
  const tone: MockupTone = slotTone(slot.tone);
  // The preview follows the box as it moves; the folds or the curve update once saved.
  const preview: TemplateOverrides = { [slotKey({ kind, tone, side: slot.side })]: { src, area: box, ...(view.warp ? { warp: view.warp } : {}) } };
  const badge = custom ? "Foto propia" : color ? "Sin foto propia" : "Imagen original";
  const resetLabel = color ? "Quitar la foto propia" : "Volver a la imagen original";
  const resetMessage = color
    ? `¿Quitar la foto propia de ${label.toLowerCase()}? La foto subida se borra y el color vuelve a usar la base ${tone === "dark" ? "oscura" : "clara"}.`
    : `¿Volver a la imagen original de ${label.toLowerCase()}? La foto subida se borra.`;

  const move = (left: number, top: number, width = box.width) => setBox(fitTemplateArea(kind, { left, top, width }));

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
    <div className="template-editor">
      <p className="template-editor__title">
        {label}
        <span className={`badge ${custom ? "badge--ok" : "badge--pending"}`}>{badge}</span>
      </p>
      {fallback && <p className="muted">{fallback} Subí una foto de este color para usarla en su lugar.</p>}
      <div className="template-editor__views">
        <figure className="template-editor__view">
          <div ref={stage} className="template-editor__stage">
            <Image src={src} alt="" width={TEMPLATE_PX} height={TEMPLATE_PX} sizes="(max-width: 559px) 100vw, 480px" className="template-editor__photo" />
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
          <figcaption className="fine-print">
            {custom
              ? "Arrastrá la zona de estampa (o movela con las flechas del teclado)."
              : `${fallback ? "Imagen de la base" : "Imagen original"}: subí una foto propia para mover la zona de estampa.`}
          </figcaption>
        </figure>
        <figure className="template-editor__view">
          <MockupStage
            kind={kind}
            tone={tone}
            side={slot.side}
            imageUrl={SAMPLE.src(tone)}
            width={SAMPLE.width}
            height={SAMPLE.height}
            alt={`Vista previa con un diseño de ejemplo en ${label.toLowerCase()}`}
            sizes="(max-width: 559px) 100vw, 480px"
            overrides={preview}
          />
          <figcaption className="fine-print">Así se ve en la tienda, con un diseño de ejemplo.</figcaption>
        </figure>
      </div>

      <div className="template-editor__controls">
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
            {kind === "mug" && (
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
                  0 % = el diseño queda plano; más alto = se envuelve más alrededor de la taza. Se ve en la vista previa al guardar.
                </p>
              </div>
            )}
            <button type="submit" className="btn btn--coal" disabled={savingArea || !changed}>
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
            <button type="submit" className={custom ? "btn btn--ghost" : "btn btn--coal"} disabled={uploading}>
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
            <ConfirmButton message={resetMessage}>{resetLabel}</ConfirmButton>
          </form>
        )}
      </div>
    </div>
  );
}
