/**
 * Sticker sheet layout (Custom Lab). Shared by the browser (instant "N planchas")
 * and the server (the layout that is saved and turned into the plotter PSD).
 *
 * Sheet: 21 × 29 cm. The four corners keep a 1.5 × 1.5 cm area for the cutter's
 * registration marks. Pieces keep a 2 mm gap between them (and from the corner
 * areas) and a 3 mm margin from the sheet edge. Packing: MaxRects, best short
 * side fit, each piece tried at 0° and 90°. Deterministic for the same input.
 * All measures in tenths of a millimetre internally, to avoid float drift.
 */

export type SheetSpec = { widthMm: number; heightMm: number; cornerMm: number; edgeMarginMm: number; gapMm: number };

export const SHEET: SheetSpec = { widthMm: 210, heightMm: 290, cornerMm: 15, edgeMarginMm: 3, gapMm: 2 };

/** White contour around every sticker: 32 px at 300 dpi. */
export const CONTOUR_PX = 32;
export const PRINT_DPI = 300;
export const CONTOUR_MM = (CONTOUR_PX / PRINT_DPI) * 25.4;

export const STICKER_SIZE_CM = { min: 4, max: 6 } as const;

export type PieceRequest = { id: string; widthMm: number; heightMm: number; quantity: number };
export type Placement = { id: string; copy: number; xMm: number; yMm: number; widthMm: number; heightMm: number; rotated: boolean };
export type SheetLayout = { sheets: Placement[][]; unplaced: string[] };

type Rect = { x: number; y: number; w: number; h: number };

const T = (mm: number) => Math.round(mm * 10);
const MM = (t: number) => t / 10;

/**
 * Footprint of one sticker on the sheet: the design scaled so its longer side is
 * `sizeCm`, plus the white contour on every side.
 */
export function stickerFootprintMm(designWidthPx: number, designHeightPx: number, sizeCm: number) {
  const longer = Math.max(designWidthPx, designHeightPx);
  const scale = (sizeCm * 10) / longer;
  return {
    widthMm: designWidthPx * scale + 2 * CONTOUR_MM,
    heightMm: designHeightPx * scale + 2 * CONTOUR_MM,
  };
}

const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contains = (a: Rect, b: Rect) => b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;

/** Removes `used` from the free rectangles (MaxRects split), then drops redundant ones. */
function occupy(free: Rect[], used: Rect): Rect[] {
  const next: Rect[] = [];
  for (const f of free) {
    if (!intersects(f, used)) {
      next.push(f);
      continue;
    }
    if (used.x > f.x) next.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
    if (used.x + used.w < f.x + f.w) next.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - (used.x + used.w), h: f.h });
    if (used.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
    if (used.y + used.h < f.y + f.h) next.push({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - (used.y + used.h) });
  }
  return next.filter((r, i) => r.w > 0 && r.h > 0 && !next.some((o, j) => j !== i && contains(o, r) && (j < i || !contains(r, o))));
}

/**
 * Free space of an empty sheet, in "inflated" coordinates: every piece and
 * obstacle is grown by the gap on its right and bottom, so placing pieces edge
 * to edge leaves exactly one gap between them.
 */
function emptySheet(spec: SheetSpec): Rect[] {
  const W = T(spec.widthMm);
  const H = T(spec.heightMm);
  const m = T(spec.edgeMarginMm);
  const g = T(spec.gapMm);
  const c = T(spec.cornerMm);
  let free: Rect[] = [{ x: m, y: m, w: W - 2 * m + g, h: H - 2 * m + g }];
  const corners: Rect[] = [
    { x: 0, y: 0, w: c + g, h: c + g },
    { x: W - c, y: 0, w: c + g, h: c + g },
    { x: 0, y: H - c, w: c + g, h: c + g },
    { x: W - c, y: H - c, w: c + g, h: c + g },
  ];
  for (const corner of corners) free = occupy(free, corner);
  return free;
}

/** Best short side fit over every free rectangle and both orientations. */
function findSpot(free: Rect[], w: number, h: number): { rect: Rect; rotated: boolean } | null {
  let best: { rect: Rect; rotated: boolean; score: number; long: number } | null = null;
  for (const f of free) {
    for (const [pw, ph, rotated] of [
      [w, h, false],
      [h, w, true],
    ] as const) {
      if (pw > f.w || ph > f.h) continue;
      const score = Math.min(f.w - pw, f.h - ph);
      const long = Math.max(f.w - pw, f.h - ph);
      const better =
        !best ||
        score < best.score ||
        (score === best.score && long < best.long) ||
        (score === best.score && long === best.long && (f.y < best.rect.y || (f.y === best.rect.y && f.x < best.rect.x)));
      if (better) best = { rect: { x: f.x, y: f.y, w: pw, h: ph }, rotated, score, long };
      if (w === h) break;
    }
  }
  return best && { rect: best.rect, rotated: best.rotated };
}

/** Lays out every copy of every piece over as few sheets as possible. */
export function packSheets(pieces: PieceRequest[], spec: SheetSpec = SHEET): SheetLayout {
  const g = T(spec.gapMm);
  // Biggest first (then by id) makes the result stable and usually tighter.
  const queue = [...pieces]
    .filter((piece) => piece.quantity > 0)
    .sort((a, b) => b.widthMm * b.heightMm - a.widthMm * a.heightMm || a.id.localeCompare(b.id))
    .flatMap((piece) => Array.from({ length: piece.quantity }, (_, copy) => ({ ...piece, copy: copy + 1 })));

  const sheets: { free: Rect[]; placements: Placement[] }[] = [];
  const unplaced: string[] = [];

  for (const piece of queue) {
    const w = T(piece.widthMm) + g;
    const h = T(piece.heightMm) + g;
    let placed = false;
    for (const sheet of [...sheets, null]) {
      const target = sheet ?? { free: emptySheet(spec), placements: [] };
      const spot = findSpot(target.free, w, h);
      if (!spot) {
        if (!sheet) unplaced.push(piece.id); // does not fit even on an empty sheet
        if (!sheet) break;
        continue;
      }
      target.free = occupy(target.free, spot.rect);
      target.placements.push({
        id: piece.id,
        copy: piece.copy,
        xMm: MM(spot.rect.x),
        yMm: MM(spot.rect.y),
        widthMm: MM(spot.rect.w - g),
        heightMm: MM(spot.rect.h - g),
        rotated: spot.rotated,
      });
      if (!sheet) sheets.push(target);
      placed = true;
      break;
    }
    if (!placed && !unplaced.includes(piece.id)) unplaced.push(piece.id);
  }

  return { sheets: sheets.map((sheet) => sheet.placements), unplaced };
}

/** How many copies of one piece fit on a single sheet (for "X stickers por plancha"). */
export function perSheet(widthMm: number, heightMm: number, spec: SheetSpec = SHEET): number {
  const capacityGuess = Math.ceil((spec.widthMm * spec.heightMm) / (widthMm * heightMm)) + 1;
  return packSheets([{ id: "x", widthMm, heightMm, quantity: capacityGuess }], spec).sheets[0]?.length ?? 0;
}
