"use client";

import { useActionState, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { submitTshirtOrderAction, uploadLabImageAction, type LabFormState } from "@/app/encargos/lab-actions";
import {
  CATALOG_DESIGNS,
  catalogDesignSrc,
  clampPlacement,
  printArea,
  printWidthCm,
  SCALE_RANGE,
  SHIRT_COLORS,
  SHIRT_SIDES,
  SHIRT_SIZES,
  shirtTemplateSrc,
  TEMPLATE_PX,
  type Placement,
  type ShirtColor,
  type ShirtSide,
} from "@/lib/lab/tshirt";

type DesignChoice =
  | { source: "catalog"; id: string; name: string; aspect: number }
  | { source: "upload"; uploadId: string; name: string; aspect: number; src: string; widthPx: number };

const pct = (n: number) => `${(n / TEMPLATE_PX) * 100}%`;

export function TshirtLab() {
  const [color, setColor] = useState<ShirtColor>("black");
  const [side, setSide] = useState<ShirtSide>("front");
  const [design, setDesign] = useState<DesignChoice | null>(null);
  const [placement, setPlacement] = useState<Placement>({ scale: 0.7, x: 0.5, y: 0.35 });
  const [sizes, setSizes] = useState<Record<string, number>>({ M: 1 });
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  // Created on the first submit (never while prerendering: it would be shared by every visitor)
  // and reused on retries, so a double click or a resend never creates two requests.
  const idempotencyKey = useRef("");
  const submit = (formData: FormData) => {
    idempotencyKey.current ||= crypto.randomUUID();
    formData.set("idempotencyKey", idempotencyKey.current);
    action(formData);
  };
  const [state, action, pending] = useActionState<LabFormState, FormData>(submitTshirtOrderAction, {});
  const areaRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const area = printArea(color, side);
  const aspect = design?.aspect ?? 1;
  const placed = clampPlacement(placement, aspect);
  const designSrc = design ? (design.source === "catalog" ? catalogDesignSrc(design.id, color) : design.src) : null;
  const widthCm = printWidthCm(placed);
  const dpi = design?.source === "upload" ? Math.round(design.widthPx / (widthCm / 2.54)) : null;
  const total = Object.values(sizes).reduce((sum, n) => sum + (n || 0), 0);

  const move = (patch: Partial<Placement>) => setPlacement((p) => clampPlacement({ ...p, ...patch }, aspect));

  function pointerPosition(event: ReactPointerEvent) {
    const rect = areaRef.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  }

  async function pickCatalog(id: string, name: string) {
    // Aspect from the real image, so the frame matches what gets printed.
    const img = new Image();
    img.src = catalogDesignSrc(id, color);
    await img.decode().catch(() => undefined);
    setDesign({ source: "catalog", id, name, aspect: img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0.79 });
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploadError("");
    setUploading(true);
    const form = new FormData();
    form.set("file", file);
    const result = await uploadLabImageAction(form);
    setUploading(false);
    if (!result.ok) return setUploadError(result.error);
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.src = src;
    await img.decode().catch(() => undefined);
    setDesign({ source: "upload", uploadId: result.uploadId, name: result.name, src, aspect: img.naturalWidth / img.naturalHeight || 1, widthPx: img.naturalWidth });
  }

  const order = JSON.stringify({
    color,
    side,
    design: design ? (design.source === "catalog" ? { source: "catalog", id: design.id } : { source: "upload", uploadId: design.uploadId, name: design.name }) : null,
    placement: placed,
    sizes: Object.entries(sizes).map(([size, quantity]) => ({ size, quantity })),
  });
  const value = (key: string) => state.values?.[key] ?? "";

  return (
    <div className="lab lab--shirt">
      <div className="shirt-editor">
        <div className="shirt-stage">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="shirt-stage__photo" src={shirtTemplateSrc(color, side)} alt={`Remera ${SHIRT_COLORS[color].toLowerCase()}, ${SHIRT_SIDES[side].toLowerCase()}`} />
          <div
            ref={areaRef}
            className="shirt-stage__area"
            style={{ left: pct(area.left), top: pct(area.top), width: pct(area.width), height: pct(area.height) }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              const pos = pointerPosition(event);
              move({ x: pos.x - drag.current.dx, y: pos.y - drag.current.dy });
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            {designSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={`shirt-stage__design${color === "white" ? " is-multiply" : ""}`}
                src={designSrc}
                alt={`Diseño ${design!.name}`}
                draggable={false}
                style={{ width: `${placed.scale * 100}%`, left: `${placed.x * 100}%`, top: `${placed.y * 100}%` }}
                onPointerDown={(event) => {
                  event.currentTarget.parentElement!.setPointerCapture(event.pointerId);
                  const pos = pointerPosition(event);
                  drag.current = { dx: pos.x - placed.x, dy: pos.y - placed.y };
                }}
              />
            )}
          </div>
        </div>

        <div className="shirt-controls">
          <fieldset className="lab-options">
            <legend>Color</legend>
            {(Object.keys(SHIRT_COLORS) as ShirtColor[]).map((c) => (
              <label key={c} className="lab-option">
                <input type="radio" name="shirt-color" checked={color === c} onChange={() => setColor(c)} />
                {SHIRT_COLORS[c]}
              </label>
            ))}
          </fieldset>
          <fieldset className="lab-options">
            <legend>Estampa en</legend>
            {(Object.keys(SHIRT_SIDES) as ShirtSide[]).map((s) => (
              <label key={s} className="lab-option">
                <input type="radio" name="shirt-side" checked={side === s} onChange={() => setSide(s)} />
                {SHIRT_SIDES[s]}
              </label>
            ))}
          </fieldset>

          <fieldset className="lab-options lab-options--designs">
            <legend>Diseño</legend>
            {CATALOG_DESIGNS.map((d) => (
              <button
                key={d.id}
                type="button"
                className="lab-design-pick"
                aria-pressed={design?.source === "catalog" && design.id === d.id}
                onClick={() => pickCatalog(d.id, d.name)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={catalogDesignSrc(d.id, color)} alt="" />
                {d.name}
              </button>
            ))}
            <label className="lab-design-pick lab-design-pick--upload">
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => upload(event.currentTarget.files?.[0])} disabled={uploading} />
              {uploading ? "Subiendo…" : design?.source === "upload" ? `Tuyo: ${design.name}` : "+ Subir el tuyo"}
            </label>
          </fieldset>
          {uploadError && <p className="form-alert" role="alert">{uploadError}</p>}

          {design && (
            <div className="lab-position">
              <div className="field">
                <label htmlFor="shirt-scale">Tamaño: {widthCm.toLocaleString("es-AR")} cm de ancho</label>
                <input id="shirt-scale" type="range" min={SCALE_RANGE.min} max={SCALE_RANGE.max} step={0.01} value={placed.scale} onChange={(e) => move({ scale: Number(e.currentTarget.value) })} />
              </div>
              <div className="field">
                <label htmlFor="shirt-x">Posición horizontal</label>
                <input id="shirt-x" type="range" min={0} max={1} step={0.01} value={placed.x} onChange={(e) => move({ x: Number(e.currentTarget.value) })} />
              </div>
              <div className="field">
                <label htmlFor="shirt-y">Posición vertical</label>
                <input id="shirt-y" type="range" min={0} max={1} step={0.01} value={placed.y} onChange={(e) => move({ y: Number(e.currentTarget.value) })} />
              </div>
              <button type="button" className="link-button" onClick={() => move({ x: 0.5 })}>
                Centrar
              </button>
              <p className="muted">También podés arrastrar el diseño sobre la remera.</p>
              {dpi !== null && dpi < 150 && <p className="lab-dpi lab-dpi--bad">Resolución baja ({dpi} dpi): achicalo o subí una imagen más grande.</p>}
              {dpi !== null && dpi >= 150 && dpi < 300 && <p className="lab-dpi lab-dpi--warn">Resolución aceptable ({dpi} dpi).</p>}
            </div>
          )}
        </div>
      </div>

      <section className="lab__step" aria-labelledby="shirt-sizes">
        <h2 id="shirt-sizes">Talles y cantidades</h2>
        <div className="lab-sizes">
          {SHIRT_SIZES.map((size) => (
            <div key={size} className="field">
              <label htmlFor={`size-${size}`}>{size}</label>
              <input
                id={`size-${size}`}
                type="number"
                min={0}
                max={200}
                value={sizes[size] ?? 0}
                onChange={(e) => {
                  // Read the value now: the event is gone by the time the updater runs.
                  const quantity = Math.max(0, Math.min(200, Math.round(Number(e.currentTarget.value) || 0)));
                  setSizes((s) => ({ ...s, [size]: quantity }));
                }}
              />
            </div>
          ))}
        </div>
        <p role="status">
          <strong>
            {total} {total === 1 ? "remera" : "remeras"}
          </strong>
        </p>
      </section>

      <section className="lab__step" aria-labelledby="shirt-contact">
        <h2 id="shirt-contact">Tus datos</h2>
        <form action={submit} className="quote-form" noValidate>
          {state.error && (
            <p className="form-alert" role="alert">
              {state.error}
            </p>
          )}
          <input type="hidden" name="order" value={order} />
          <div className="visually-hidden" aria-hidden="true">
            <label htmlFor="shirt-website">No completar</label>
            <input id="shirt-website" name="website" tabIndex={-1} autoComplete="off" />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="shirt-name">Nombre *</label>
              <input id="shirt-name" name="name" autoComplete="name" defaultValue={value("name")} aria-invalid={Boolean(state.fields?.name)} />
              {state.fields?.name && <p className="field__error">{state.fields.name}</p>}
            </div>
            <div className="field">
              <label htmlFor="shirt-email">Email *</label>
              <input id="shirt-email" name="email" type="email" autoComplete="email" defaultValue={value("email")} aria-invalid={Boolean(state.fields?.email)} />
              {state.fields?.email && <p className="field__error">{state.fields.email}</p>}
            </div>
          </div>
          <div className="field">
            <label htmlFor="shirt-notes">Comentarios</label>
            <textarea id="shirt-notes" name="notes" rows={3} defaultValue={value("notes")} placeholder="Opcional: tela, fecha, cualquier detalle." />
          </div>
          <button type="submit" className="btn btn--acid btn--lg" disabled={pending || !design || total === 0 || (dpi !== null && dpi < 150)}>
            {pending ? "Preparando tu remera…" : "Pedir presupuesto"}
          </button>
          <p className="fine-print">Te respondemos con el presupuesto por email. Al enviar confirmás que tenés derecho a usar la imagen que subiste.</p>
        </form>
      </section>
    </div>
  );
}
