// Design catalog mockup templates and their warp maps.
//
//   node scripts/generate-mockups.mjs
//
// Templates (1080 × 1080 PNG with a transparent background, public/lab/mockups;
// the stage paints the same grey behind every product, like the Custom Lab):
// - tank tops: product photos from scripts/mockup-sources (white and black), with
//   the white studio background cut away;
// - mug: rendered here by a small ray tracer (white ceramic, floating, soft shadow),
//   so its exact geometry is known and the design can be wrapped around it;
// - sticker surface: empty, the sticker sits straight on the stage.
// The T-shirt reuses the Custom Lab photos in public/lab/shirts.
//
// Warp maps (public/lab/mockups/warp, one pair per template that declares `warp`
// in src/lib/designs/mockups.ts, sized like its print area):
// - `<name>-map.png`: an SVG feDisplacementMap. Red/green hold where each pixel of
//   the print area reads the flat design from, as (offset / scale + 0.5).
//   Fabric: offsets follow the folds of the photo. Mug: the cylinder unwraps the
//   design around its curve. Alpha marks where the print can be (the mug's face).
// - `<name>-shade.png`: grey around 128 laid over the design with soft-light, so
//   folds and the glaze highlight show through the ink.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { MOCKUP_KINDS } from "../src/lib/designs/kinds.ts";
import { MOCKUPS, mockupTemplate, TEMPLATE_PX } from "../src/lib/designs/mockups.ts";
import { cutOutWhiteBackground, fabricWarp } from "../src/server/mockups/warp.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(root, "public", "lab", "mockups");
const publicFile = (src) => join(root, "public", ...src.split("/").filter(Boolean));
mkdirSync(join(out, "warp"), { recursive: true });

const SIZE = TEMPLATE_PX;

/* ------------------------------------------------------------------ tank tops */

async function tankTemplates() {
  for (const color of ["white", "black"]) {
    const png = await cutOutWhiteBackground(join(here, "mockup-sources", `tank-${color}.webp`));
    await sharp(png).toFile(join(out, `tank-${color}.png`));
    console.log(`✔ lab/mockups/tank-${color}.png`);
  }
}

/* ------------------------------------------------------------------ sticker */

async function stickerSurface() {
  await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png({ compressionLevel: 9 })
    .toFile(join(out, "sticker-surface.png"));
  console.log("✔ lab/mockups/sticker-surface.png");
}

/* ------------------------------------------------------------------ mug (ray traced) */

// Object space, y up, unit = the mug radius (4 cm): 8 cm wide, 9.4 cm tall.
const MUG = { r: 1, h: 2.35, wall: 0.075, floor: 0.14 };
const HANDLE = { cx: -1.16, cy: 1.2, a: 0.56, b: 0.125, squash: 1.3 };
// The printable band: 9 × 8 cm wrapped around the body, centred a little away from the handle.
const PRINT = { arc: 9 / 4, top: MUG.h / 2 + 1, bottom: MUG.h / 2 - 1 };
// Camera: orthographic, slightly to the right of the handle side, looking down, tilted like a floating product shot.
const CAMERA = { azimuth: 0.2, elevation: 0.3, roll: -0.2, view: 4.9, lift: 0.3 };
PRINT.center = CAMERA.azimuth + 0.14;

const len2 = (x, y) => Math.sqrt(x * x + y * y);
const smax = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + (h * h * k) / 4;
};
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
};
function cappedCylinder(x, y, z, radius, y0, y1, round) {
  const dx = len2(x, z) - radius + round;
  const dy = Math.abs(y - (y0 + y1) / 2) - (y1 - y0) / 2 + round;
  return Math.min(Math.max(dx, dy), 0) + len2(Math.max(dx, 0), Math.max(dy, 0)) - round;
}
function mugSdf(x, y, z) {
  const outer = cappedCylinder(x, y, z, MUG.r, 0, MUG.h, 0.05);
  const inner = cappedCylinder(x, y, z, MUG.r - MUG.wall, MUG.floor, MUG.h + 1, 0.04);
  const body = smax(outer, -inner, 0.03);
  const q = len2(x - HANDLE.cx, (y - HANDLE.cy) / HANDLE.squash) - HANDLE.a;
  const ring = (len2(q, z) - HANDLE.b) * 0.8;
  const handle = Math.max(ring, -(len2(x, z) - (MUG.r - 0.02)));
  return smin(body, handle, 0.08);
}

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const target = [0, MUG.h / 2, 0];
const toCamera = [Math.sin(CAMERA.azimuth) * Math.cos(CAMERA.elevation), Math.sin(CAMERA.elevation), Math.cos(CAMERA.azimuth) * Math.cos(CAMERA.elevation)];
const forward = toCamera.map((c) => -c);
const right0 = norm(cross(forward, [0, 1, 0]));
const up0 = cross(right0, forward);
const cr = Math.cos(CAMERA.roll);
const sr = Math.sin(CAMERA.roll);
const right = right0.map((c, i) => c * cr + up0[i] * sr);
const up = up0.map((c, i) => c * cr - right0[i] * sr);

/** Ray origin for a template pixel position (sub-pixel coordinates allowed). */
function rayOrigin(px, py) {
  const sx = (px / SIZE - 0.5) * CAMERA.view;
  const sy = (0.5 - py / SIZE) * CAMERA.view - CAMERA.lift;
  return [0, 1, 2].map((i) => target[i] + right[i] * sx + up[i] * sy - forward[i] * 6);
}

function trace(o) {
  let t = 3;
  for (let i = 0; i < 160 && t < 9; i++) {
    const d = mugSdf(o[0] + forward[0] * t, o[1] + forward[1] * t, o[2] + forward[2] * t);
    if (d < 1e-4) return t;
    t += d;
  }
  return -1;
}

function normalAt(x, y, z) {
  const e = 1e-3;
  return norm([
    mugSdf(x + e, y, z) - mugSdf(x - e, y, z),
    mugSdf(x, y + e, z) - mugSdf(x, y - e, z),
    mugSdf(x, y, z + e) - mugSdf(x, y, z - e),
  ]);
}

const KEY = norm([-0.55, 0.75, 0.55]);
const FILL = norm([0.8, 0.25, 0.4]);
const SOFTBOX = norm([-0.75, 0.15, 0.65]);

function softShadow(p, dir) {
  let res = 1;
  let t = 0.02;
  for (let i = 0; i < 48 && t < 4; i++) {
    const h = mugSdf(p[0] + dir[0] * t, p[1] + dir[1] * t, p[2] + dir[2] * t);
    if (h < 1e-4) return 0;
    res = Math.min(res, (10 * h) / t);
    t += Math.max(h, 0.02);
  }
  return Math.max(0, Math.min(1, res));
}

function occlusion(p, n) {
  let occ = 0;
  let w = 1;
  for (let i = 1; i <= 5; i++) {
    const h = 0.06 * i;
    occ += w * (h - mugSdf(p[0] + n[0] * h, p[1] + n[1] * h, p[2] + n[2] * h));
    w *= 0.6;
  }
  return Math.max(0, Math.min(1, 1 - 1.6 * occ));
}

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Shaded ceramic at a hit point: [r, g, b] in 0–1 (display space) and the glaze highlight alone. */
function shade(p) {
  const n = normalAt(p[0], p[1], p[2]);
  const v = toCamera;
  const ao = occlusion(p, n);
  const keyDiffuse = Math.max(0, dot(n, KEY)) * softShadow(p, KEY);
  const fillDiffuse = Math.max(0, dot(n, FILL));
  const sky = 0.5 + 0.5 * n[1];
  const light = 0.62 * ao * (0.7 + 0.3 * sky) + 0.5 * keyDiffuse + 0.3 * fillDiffuse;
  const ndv = Math.max(0, dot(n, v));
  const refl = [0, 1, 2].map((i) => 2 * ndv * n[i] - v[i]);
  const halfKey = norm(KEY.map((c, i) => c + v[i]));
  const fresnel = 0.04 + 0.96 * Math.pow(1 - ndv, 5);
  const highlight =
    0.55 * Math.pow(Math.max(0, dot(n, halfKey)), 90) * (keyDiffuse > 0 ? 1 : 0) +
    0.5 * smooth(0.9, 0.97, dot(refl, SOFTBOX)) * ao +
    0.35 * fresnel * (0.6 + 0.4 * Math.max(0, refl[1])) * ao;
  const base = [0.93, 0.935, 0.945];
  // Cool bounce light on the shadow side.
  const bounce = [0.86, 0.9, 0.96];
  const color = base.map((c, i) => {
    const lit = c * light * (0.85 + 0.15 * bounce[i]) + highlight;
    return Math.pow(Math.max(0, Math.min(1, lit)), 1 / 1.7);
  });
  return { color, highlight: Math.min(1, highlight) };
}

const SAMPLES = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
];

async function mugTemplate() {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let hits = 0;
      const sum = [0, 0, 0];
      for (const [ox, oy] of SAMPLES) {
        const o = rayOrigin(x + ox, y + oy);
        const t = trace(o);
        if (t < 0) continue;
        const { color } = shade([0, 1, 2].map((i) => o[i] + forward[i] * t));
        hits++;
        for (let i = 0; i < 3; i++) sum[i] += color[i];
      }
      const k = (y * SIZE + x) * 4;
      if (hits) for (let i = 0; i < 3; i++) rgba[k + i] = Math.round((sum[i] / hits) * 255);
      rgba[k + 3] = Math.round((hits / SAMPLES.length) * 255);
    }
  }
  // Floating shadow under the mug: where its bottom centre lands, a little lower.
  const bottom = project([0, 0, 0]);
  const backdrop = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <defs>
    <filter id="blur" filterUnits="userSpaceOnUse" x="0" y="0" width="${SIZE}" height="${SIZE}"><feGaussianBlur stdDeviation="22"/></filter>
  </defs>
  <ellipse cx="${bottom.x + 30}" cy="${Math.min(SIZE - 60, bottom.y + 120)}" rx="190" ry="26" fill="#56606b" opacity="0.35" filter="url(#blur)"/>
</svg>`;
  await sharp(Buffer.from(backdrop))
    .composite([{ input: await sharp(rgba, { raw: { width: SIZE, height: SIZE, channels: 4 } }).png().toBuffer() }])
    .png({ compressionLevel: 9 })
    .toFile(join(out, "mug-white.png"));
  console.log("✔ lab/mockups/mug-white.png");
}

/** Template pixel position of an object-space point. */
function project(p) {
  const rel = p.map((c, i) => c - target[i]);
  const sx = dot(rel, right);
  const sy = dot(rel, up) + CAMERA.lift;
  return { x: (sx / CAMERA.view + 0.5) * SIZE, y: (0.5 - sy / CAMERA.view) * SIZE };
}

/**
 * Where a ray through a template pixel lands on the printable band, as (u, v)
 * across the flat design (0–1), or null when it misses the band or the handle hides it.
 */
function mugPrintUv(px, py) {
  const o = rayOrigin(px, py);
  const t = trace(o);
  if (t < 0) return null;
  const p = [0, 1, 2].map((i) => o[i] + forward[i] * t);
  if (Math.abs(len2(p[0], p[2]) - MUG.r) > 2e-3 || p[1] > PRINT.top || p[1] < PRINT.bottom) return null;
  let angle = Math.atan2(p[0], p[2]) - PRINT.center;
  angle = Math.atan2(Math.sin(angle), Math.cos(angle));
  const u = 0.5 + angle / PRINT.arc;
  if (u < 0 || u > 1) return null;
  const v = (PRINT.top - p[1]) / (PRINT.top - PRINT.bottom);
  // The glaze highlight at this point, for the shade map.
  return { u, v, highlight: shade(p).highlight };
}

async function writeWarp(name, width, height, map, shadeMap) {
  await sharp(map, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(join(out, "warp", `${name}-map.png`));
  await sharp(shadeMap, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(join(out, "warp", `${name}-shade.png`));
  console.log(`✔ lab/mockups/warp/${name}-{map,shade}.png (${width}×${height})`);
}

async function mugWarp(name, area, scale) {
  const { width, height } = area;
  const map = Buffer.alloc(width * height * 4);
  const shadeMap = Buffer.alloc(width * height * 4);
  let worst = 0;
  const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = (y * width + x) * 4;
      let inside = 0;
      for (const [ox, oy] of SAMPLES) if (mugPrintUv(area.left + x + ox, area.top + y + oy)) inside++;
      const centre = mugPrintUv(area.left + x + 0.5, area.top + y + 0.5);
      map[k + 2] = 0;
      map[k + 3] = 255;
      shadeMap[k + 3] = Math.round((inside / SAMPLES.length) * 255);
      if (!centre) {
        map[k] = map[k + 1] = 128;
        shadeMap[k] = shadeMap[k + 1] = shadeMap[k + 2] = 128;
        continue;
      }
      bounds.left = Math.min(bounds.left, area.left + x);
      bounds.right = Math.max(bounds.right, area.left + x);
      bounds.top = Math.min(bounds.top, area.top + y);
      bounds.bottom = Math.max(bounds.bottom, area.top + y);
      const dx = centre.u * width - (x + 0.5);
      const dy = centre.v * height - (y + 0.5);
      worst = Math.max(worst, Math.abs(dx), Math.abs(dy));
      map[k] = Math.max(0, Math.min(255, Math.round((dx / scale + 0.5) * 255)));
      map[k + 1] = Math.max(0, Math.min(255, Math.round((dy / scale + 0.5) * 255)));
      const grey = Math.round(128 + 127 * Math.min(1, centre.highlight * 1.4));
      shadeMap[k] = shadeMap[k + 1] = shadeMap[k + 2] = grey;
    }
  }
  console.log(`  mug print band spans x ${bounds.left}–${bounds.right}, y ${bounds.top}–${bounds.bottom}; largest offset ${worst.toFixed(1)} px`);
  if (bounds.left <= area.left || bounds.right >= area.left + width - 1 || bounds.top <= area.top || bounds.bottom >= area.top + height - 1) {
    throw new Error(`The mug print area ${JSON.stringify(area)} clips the band: widen it in src/lib/designs/mockups.ts.`);
  }
  if (worst > scale / 2) throw new Error(`The mug warp scale ${scale} is too small: it needs at least ${Math.ceil(worst * 2)}.`);
  await writeWarp(name, width, height, map, shadeMap);
}

/* ------------------------------------------------------------------ fabric */

/**
 * Fabric warp from the garment photo: the design shifts along the slope of the
 * folds (blurred luminance as a height field) and the folds' light and shadow
 * (luminance minus its broad average) is laid back over it.
 */
async function writeFabricWarp(name, src, area, scale) {
  const { map, shade } = await fabricWarp(publicFile(src), area, scale);
  await sharp(map).toFile(join(out, "warp", `${name}-map.png`));
  await sharp(shade).toFile(join(out, "warp", `${name}-shade.png`));
  console.log(`✔ lab/mockups/warp/${name}-{map,shade}.png (${area.width}×${area.height})`);
}

/* ------------------------------------------------------------------ run */

await tankTemplates();
await stickerSurface();
await mugTemplate();

const done = new Set();
for (const kind of MOCKUP_KINDS) {
  for (const tone of MOCKUPS[kind].tones) {
    for (const side of MOCKUPS[kind].sides) {
      const template = mockupTemplate(kind, tone, side);
      if (!template.warp || done.has(template.warp.map)) continue;
      done.add(template.warp.map);
      const name = template.warp.map.split("/").pop().replace(/-map\.png$/, "");
      if (kind === "mug") await mugWarp(name, template.area, template.warp.scale);
      else await writeFabricWarp(name, template.src, template.area, template.warp.scale);
    }
  }
}
