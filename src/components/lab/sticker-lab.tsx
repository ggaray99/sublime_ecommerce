"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  previewStickerAction,
  submitStickerOrderAction,
  uploadLabImageAction,
  type LabFormState,
} from "@/app/encargos/lab-actions";
import { packSheets, SHEET, STICKER_SIZE_CM, stickerFootprintMm } from "@/lib/lab/sheets";
import { estimateSheets, type LabPricing } from "@/lib/lab/pricing";
import { formatPrice } from "@/lib/format";

const MAX_DESIGNS = 8;
const MAX_MB = 15;
type Design = {
  key: string;
  uploadId: string;
  name: string;
  sizeCm: number;
  quantity: number;
  removeBackground: boolean;
  tolerance: number;
  image?: string;
  sourceWidthPx?: number;
  sourceHeightPx?: number;
  hadTransparency?: boolean;
  loading: boolean;
  error?: string;
};

/** Resolution the artwork gives at the chosen size (the server enforces the same limits). */
function dpiOf(design: Design) {
  if (!design.sourceWidthPx || !design.sourceHeightPx) return null;
  return Math.round(Math.max(design.sourceWidthPx, design.sourceHeightPx) / (design.sizeCm / 2.54));
}

function DpiNote({ dpi }: { dpi: number | null }) {
  if (dpi === null) return null;
  if (dpi >= 300) return <p className="lab-dpi lab-dpi--ok">Resolución excelente ({dpi} dpi).</p>;
  if (dpi >= 150) return <p className="lab-dpi lab-dpi--warn">Resolución aceptable ({dpi} dpi): puede verse un poco menos nítido.</p>;
  return <p className="lab-dpi lab-dpi--bad">Resolución baja ({dpi} dpi): elegí un tamaño menor o subí una imagen más grande.</p>;
}

export function StickerLab({ pricing }: { pricing: LabPricing }) {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  // Created on the first submit (never while prerendering: it would be shared by every visitor)
  // and reused on retries, so a double click or a resend never creates two requests.
  const idempotencyKey = useRef("");
  const submit = (formData: FormData) => {
    idempotencyKey.current ||= crypto.randomUUID();
    formData.set("idempotencyKey", idempotencyKey.current);
    action(formData);
  };
  const [state, action, pending] = useActionState<LabFormState, FormData>(submitStickerOrderAction, {});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const update = (key: string, patch: Partial<Design>) => setDesigns((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  /** Asks the server for the real result (background, contour) after the controls settle. */
  function refresh(design: Design) {
    const pendingTimer = timers.current.get(design.key);
    if (pendingTimer) clearTimeout(pendingTimer);
    update(design.key, { loading: true });
    timers.current.set(
      design.key,
      setTimeout(async () => {
        const result = await previewStickerAction({
          uploadId: design.uploadId,
          sizeCm: design.sizeCm,
          removeBackground: design.removeBackground,
          tolerance: design.tolerance,
        });
        update(
          design.key,
          result.ok
            ? { loading: false, error: undefined, image: result.image, sourceWidthPx: result.sourceWidthPx, sourceHeightPx: result.sourceHeightPx, hadTransparency: result.hadTransparency }
            : { loading: false, error: result.error },
        );
      }, 350),
    );
  }

  function change(design: Design, patch: Partial<Design>, reprocess: boolean) {
    const next = { ...design, ...patch };
    update(design.key, patch);
    if (reprocess) refresh(next);
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploadError("");
    const room = MAX_DESIGNS - designs.length;
    if (room <= 0) return setUploadError(`Podés subir hasta ${MAX_DESIGNS} diseños.`);
    setUploading(true);
    for (const file of [...files].slice(0, room)) {
      if (file.size > MAX_MB * 1024 * 1024) {
        setUploadError(`"${file.name}" supera los ${MAX_MB} MB.`);
        continue;
      }
      const form = new FormData();
      form.set("file", file);
      const result = await uploadLabImageAction(form);
      if (!result.ok) {
        setUploadError(`${file.name}: ${result.error}`);
        continue;
      }
      const design: Design = { key: result.uploadId, uploadId: result.uploadId, name: result.name, sizeCm: 5, quantity: 10, removeBackground: true, tolerance: 32, loading: true };
      setDesigns((list) => [...list, design]);
      refresh(design);
    }
    setUploading(false);
  }

  useEffect(() => {
    const pendingTimers = timers.current;
    return () => pendingTimers.forEach((timer) => clearTimeout(timer));
  }, []);

  const ready = designs.filter((d) => d.sourceWidthPx && !d.error);
  // Same layout code the server uses, so the count shown is the count made.
  const layout = packSheets(ready.map((d) => ({ id: d.key, ...stickerFootprintMm(d.sourceWidthPx!, d.sourceHeightPx!, d.sizeCm), quantity: d.quantity })));
  const images = new Map(ready.map((d) => [d.key, d.image]));
  // Only designs that passed the server checks count (the rest show their error).
  const total = ready.reduce((sum, d) => sum + d.quantity, 0);
  const blocked = designs.some((d) => d.loading || d.error || (dpiOf(d) ?? 0) < 150);
  const payload = JSON.stringify(
    designs.map(({ uploadId, name, sizeCm, quantity, removeBackground, tolerance }) => ({ uploadId, name, sizeCm, quantity, removeBackground, tolerance })),
  );
  const value = (key: string) => state.values?.[key] ?? "";

  return (
    <div className="lab">
      <section className="lab__step" aria-labelledby="lab-designs">
        <h2 id="lab-designs">1. Subí tus diseños</h2>
        <p className="muted">PNG, JPG o WebP de hasta {MAX_MB} MB. Si tiene fondo liso, lo quitamos; un PNG con fondo transparente queda perfecto.</p>
        <label className="lab-drop">
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => addFiles(event.currentTarget.files)} disabled={uploading || designs.length >= MAX_DESIGNS} />
          <span>{uploading ? "Subiendo…" : designs.length ? "+ Sumar otro diseño" : "Elegir imágenes"}</span>
        </label>
        {uploadError && <p className="form-alert" role="alert">{uploadError}</p>}

        <ul className="lab-designs">
          {designs.map((design) => {
            const dpi = dpiOf(design);
            return (
              <li key={design.key} className="lab-design" aria-busy={design.loading}>
                <div className="lab-design__preview">
                  {design.image ? (
                    // Server-made data URL: next/image adds nothing here.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={design.image} alt={`Vista previa de ${design.name} con contorno blanco`} />
                  ) : (
                    <span className="muted">{design.error ? "Sin vista previa" : "Procesando…"}</span>
                  )}
                </div>
                <div className="lab-design__controls">
                  <p className="lab-design__name">{design.name}</p>
                  <div className="field">
                    <label htmlFor={`size-${design.key}`}>Tamaño: {design.sizeCm.toLocaleString("es-AR")} cm (lado mayor)</label>
                    <input
                      id={`size-${design.key}`}
                      type="range"
                      min={STICKER_SIZE_CM.min}
                      max={STICKER_SIZE_CM.max}
                      step={0.5}
                      value={design.sizeCm}
                      onChange={(event) => change(design, { sizeCm: Number(event.currentTarget.value) }, true)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`qty-${design.key}`}>Cantidad</label>
                    <input
                      id={`qty-${design.key}`}
                      type="number"
                      min={1}
                      max={500}
                      value={design.quantity}
                      onChange={(event) => change(design, { quantity: Math.max(1, Math.min(500, Math.round(Number(event.currentTarget.value) || 1))) }, false)}
                    />
                  </div>
                  {design.hadTransparency ? (
                    <p className="muted">Ya tiene fondo transparente.</p>
                  ) : (
                    <div className="lab-design__bg">
                      <label className="lab-check">
                        <input type="checkbox" checked={design.removeBackground} onChange={(event) => change(design, { removeBackground: event.currentTarget.checked }, true)} />
                        Quitar el fondo
                      </label>
                      {design.removeBackground && (
                        <div className="field">
                          <label htmlFor={`tol-${design.key}`}>Sensibilidad: {design.tolerance}</label>
                          <input
                            id={`tol-${design.key}`}
                            type="range"
                            min={8}
                            max={80}
                            step={4}
                            value={design.tolerance}
                            onChange={(event) => change(design, { tolerance: Number(event.currentTarget.value) }, true)}
                            aria-describedby={`tol-hint-${design.key}`}
                          />
                          <p className="field__hint" id={`tol-hint-${design.key}`}>
                            Si se borra parte del dibujo, bajala o desactivá “Quitar el fondo”.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <DpiNote dpi={dpi} />
                  {design.error && <p className="field__error">{design.error}</p>}
                  <button type="button" className="link-button" onClick={() => setDesigns((list) => list.filter((d) => d.key !== design.key))}>
                    Quitar diseño
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {ready.length > 0 && (
        <section className="lab__step" aria-labelledby="lab-sheets">
          <h2 id="lab-sheets">2. Tus planchas</h2>
          <p role="status">
            <strong>
              {total} {total === 1 ? "sticker" : "stickers"} en {layout.sheets.length} {layout.sheets.length === 1 ? "plancha" : "planchas"} de 21 × 29 cm
            </strong>
            {layout.sheets.length > 0 && <span className="muted"> · {layout.sheets.map((s) => s.length).join(" + ")} por plancha</span>}
          </p>
          {(() => {
            const estimate = estimateSheets(pricing, layout.sheets.length);
            if (!estimate) return null;
            const next = pricing.tiers.find((tier) => tier.minSheets > estimate.sheets);
            return (
              <p className="lab-estimate" aria-live="polite">
                Precio estimado: <strong>{formatPrice(estimate.totalMinor / 100)}</strong>{" "}
                <span className="muted">
                  ({estimate.sheets} × {formatPrice(estimate.unitMinor / 100)}
                  {estimate.percent ? `, ${estimate.percent} % menos por cantidad` : ""})
                  {next && ` · desde ${next.minSheets} planchas, ${next.percent} % menos`}. Te confirmamos el presupuesto final.
                </span>
              </p>
            );
          })()}
          {layout.unplaced.length > 0 && <p className="form-alert">Algún diseño no entra en la plancha: probá con un tamaño menor.</p>}
          <ul className="lab-sheets">
            {layout.sheets.slice(0, 4).map((sheet, index) => (
              <li key={index}>
                <svg viewBox={`0 0 ${SHEET.widthMm} ${SHEET.heightMm}`} role="img" aria-label={`Plancha ${index + 1}: ${sheet.length} stickers`}>
                  <rect width={SHEET.widthMm} height={SHEET.heightMm} fill="#fff" />
                  {[
                    [0, 0],
                    [SHEET.widthMm - SHEET.cornerMm, 0],
                    [0, SHEET.heightMm - SHEET.cornerMm],
                    [SHEET.widthMm - SHEET.cornerMm, SHEET.heightMm - SHEET.cornerMm],
                  ].map(([x, y]) => (
                    <rect key={`${x}-${y}`} x={x} y={y} width={SHEET.cornerMm} height={SHEET.cornerMm} fill="#e8e8e8" />
                  ))}
                  {sheet.map((p) => {
                    const href = images.get(p.id);
                    const cx = p.xMm + p.widthMm / 2;
                    const cy = p.yMm + p.heightMm / 2;
                    const w = p.rotated ? p.heightMm : p.widthMm;
                    const h = p.rotated ? p.widthMm : p.heightMm;
                    return href ? (
                      <image
                        key={`${p.id}-${p.copy}`}
                        href={href}
                        x={cx - w / 2}
                        y={cy - h / 2}
                        width={w}
                        height={h}
                        transform={p.rotated ? `rotate(90 ${cx} ${cy})` : undefined}
                      />
                    ) : null;
                  })}
                </svg>
                <span className="muted">Plancha {index + 1}</span>
              </li>
            ))}
          </ul>
          {layout.sheets.length > 4 && <p className="muted">Y {layout.sheets.length - 4} planchas más.</p>}
          <p className="fine-print">Las esquinas grises quedan libres para las guías de corte. El armado final lo hacemos con tus originales en alta resolución.</p>
        </section>
      )}

      <section className="lab__step" aria-labelledby="lab-contact">
        <h2 id="lab-contact">3. Tus datos</h2>
        <form action={submit} className="quote-form" noValidate>
          {state.error && (
            <p className="form-alert" role="alert">
              {state.error}
            </p>
          )}
          <input type="hidden" name="designs" value={payload} />
          <div className="visually-hidden" aria-hidden="true">
            <label htmlFor="lab-website">No completar</label>
            <input id="lab-website" name="website" tabIndex={-1} autoComplete="off" />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="lab-name">Nombre *</label>
              <input id="lab-name" name="name" autoComplete="name" defaultValue={value("name")} aria-invalid={Boolean(state.fields?.name)} />
              {state.fields?.name && <p className="field__error">{state.fields.name}</p>}
            </div>
            <div className="field">
              <label htmlFor="lab-email">Email *</label>
              <input id="lab-email" name="email" type="email" autoComplete="email" defaultValue={value("email")} aria-invalid={Boolean(state.fields?.email)} />
              {state.fields?.email && <p className="field__error">{state.fields.email}</p>}
            </div>
          </div>
          <div className="field">
            <label htmlFor="lab-notes">Comentarios</label>
            <textarea id="lab-notes" name="notes" rows={3} defaultValue={value("notes")} placeholder="Opcional: para qué los usás, si necesitás algo especial…" />
          </div>
          <button type="submit" className="btn btn--acid btn--lg" disabled={pending || designs.length === 0 || blocked}>
            {pending ? "Armando tus planchas…" : "Pedir presupuesto"}
          </button>
          <p className="fine-print">
            Te respondemos con el presupuesto por email. Al enviar confirmás que tenés derecho a usar las imágenes que subiste.
          </p>
        </form>
      </section>
    </div>
  );
}
