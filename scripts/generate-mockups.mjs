// Design catalog mockup templates (demo art): the blank tank tops, mug and
// sticker surface the store previews a design on. The T-shirt reuses the Custom
// Lab photos in public/lab/shirts.
//
//   node scripts/generate-mockups.mjs
//
// Every template is a 1080 × 1080 PNG. The print areas in
// src/lib/designs/mockups.ts are measured on these drawings: keep them in sync
// when a shape changes. Replace these files with real product photos (same
// size and framing) when the business has them.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "lab", "mockups");
mkdirSync(out, { recursive: true });

const SIZE = 1080;
const svg = (body, background = "#ffffff") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${background}"/>
  ${body}
</svg>`;

const softShadow = (cx, cy, rx, ry, opacity = 0.18) => `
  <defs><filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter></defs>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity="${opacity}" filter="url(#blur)"/>`;

/** Tank top: body spans x ≈ 300–780; the front neckline is a deep scoop, the back a shallow one. */
function tank(color, side) {
  const dark = color === "black";
  const neck = side === "front" ? "C 478 230 510 292 540 292 C 570 292 602 230 612 120" : "C 482 170 515 192 540 192 C 565 192 598 170 612 120";
  const rib = side === "front" ? "M 474 124 C 484 226 512 280 540 280 C 568 280 596 226 606 124" : "M 474 124 C 488 166 516 182 540 182 C 564 182 592 166 606 124";
  const shape = `M 420 120 L 468 120 ${neck} L 660 120 C 668 250 720 380 782 420 L 772 960 Q 540 976 308 960 L 298 420 C 360 380 412 250 420 120 Z`;
  return svg(`
  ${softShadow(540, 968, 250, 22)}
  <defs>
    <linearGradient id="cloth" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${dark ? "#121212" : "#e9e9e9"}"/>
      <stop offset="0.3" stop-color="${dark ? "#1f1f1f" : "#ffffff"}"/>
      <stop offset="0.7" stop-color="${dark ? "#1b1b1b" : "#fbfbfb"}"/>
      <stop offset="1" stop-color="${dark ? "#0f0f0f" : "#e4e4e4"}"/>
    </linearGradient>
  </defs>
  <path d="${shape}" fill="url(#cloth)" stroke="${dark ? "#050505" : "#d6d6d6"}" stroke-width="3" stroke-linejoin="round"/>
  <path d="${rib}" fill="none" stroke="${dark ? "#2c2c2c" : "#e2e2e2"}" stroke-width="5"/>
  <path d="M 312 940 Q 540 955 768 940" fill="none" stroke="${dark ? "#262626" : "#e4e4e4"}" stroke-width="4"/>
  ${side === "back" ? "" : `<path d="M 300 430 C 360 390 410 270 424 140" fill="none" stroke="${dark ? "#262626" : "#e6e6e6"}" stroke-width="4"/>
  <path d="M 780 430 C 720 390 670 270 656 140" fill="none" stroke="${dark ? "#262626" : "#e6e6e6"}" stroke-width="4"/>`}`);
}

/** White mug, handle on the right: body spans x 250–730, y 270–870. */
function mug() {
  return svg(
    `
  ${softShadow(500, 880, 280, 26, 0.22)}
  <defs>
    <linearGradient id="ceramic" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#c9c9c9"/>
      <stop offset="0.12" stop-color="#ececec"/>
      <stop offset="0.38" stop-color="#ffffff"/>
      <stop offset="0.75" stop-color="#f2f2f2"/>
      <stop offset="1" stop-color="#c4c4c4"/>
    </linearGradient>
    <linearGradient id="inside" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#bdbdbd"/>
      <stop offset="1" stop-color="#e9e9e9"/>
    </linearGradient>
  </defs>
  <path d="M 724 390 C 860 380 872 470 860 560 C 848 660 790 720 722 720" fill="none" stroke="#bdbdbd" stroke-width="58" stroke-linecap="round"/>
  <path d="M 724 390 C 860 380 872 470 860 560 C 848 660 790 720 722 720" fill="none" stroke="#f1f1f1" stroke-width="44" stroke-linecap="round"/>
  <path d="M 250 270 L 250 838 Q 252 884 490 888 Q 728 884 730 838 L 730 270 Z" fill="url(#ceramic)" stroke="#cfcfcf" stroke-width="3"/>
  <ellipse cx="490" cy="270" rx="240" ry="42" fill="#f7f7f7" stroke="#cfcfcf" stroke-width="3"/>
  <ellipse cx="490" cy="274" rx="222" ry="32" fill="url(#inside)"/>`,
    "#f4f3f0",
  );
}

/** Neutral surface (a laptop lid) the die-cut sticker sits on; the outline is drawn by the page. */
function stickerSurface() {
  return svg(
    `
  <defs>
    <linearGradient id="lid" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#d7d9dd"/>
      <stop offset="0.55" stop-color="#c3c6cc"/>
      <stop offset="1" stop-color="#aeb2b9"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="60" y="60" width="960" height="960" rx="48" fill="url(#lid)"/>
  <rect x="60" y="60" width="960" height="960" rx="48" fill="url(#glow)"/>
  <rect x="60" y="60" width="960" height="960" rx="48" fill="none" stroke="#9ca0a7" stroke-width="4"/>`,
    "#e9e7e2",
  );
}

const files = [
  ["tank-white-front.png", tank("white", "front")],
  ["tank-white-back.png", tank("white", "back")],
  ["tank-black-front.png", tank("black", "front")],
  ["tank-black-back.png", tank("black", "back")],
  ["mug-white.png", mug()],
  ["sticker-surface.png", stickerSurface()],
];

for (const [name, source] of files) {
  await sharp(Buffer.from(source)).png({ compressionLevel: 9 }).toFile(join(out, name));
  console.log(`✔ lab/mockups/${name}`);
}
