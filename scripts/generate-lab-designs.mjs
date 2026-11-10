// Custom Lab assets: the catalog T-shirt prints as transparent PNGs at print
// resolution, and the blank T-shirt templates the editor places them on.
//
//   node scripts/generate-lab-designs.mjs
//
// Prints are vector (same source as the catalog mockups), so they stay sharp at
// any size: 2400 px wide is 300 dpi over a 20 cm print. "claro" ink is for black
// shirts, "oscuro" for white ones.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { C } from "./art/motifs.mjs";
import { scenes } from "./art/scenes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "lab");
mkdirSync(join(out, "designs"), { recursive: true });
mkdirSync(join(out, "shirts"), { recursive: true });

const designs = [
  { id: "ruido-visual", motif: "eye", text: "RUIDO VISUAL" },
  { id: "otro-planeta", motif: "planet", text: "OTRO PLANETA" },
  { id: "gato-mutante", motif: "mutantCat", text: "MUTANTE" },
  { id: "bestia", motif: "cosmicBeast", text: "BESTIA" },
];

const WIDTH = 2400;
for (const design of designs) {
  for (const [variant, ink] of [
    ["claro", C.acid],
    ["oscuro", C.coal],
  ]) {
    const svg = Buffer.from(scenes.shirtPrint({ motif: design.motif, text: design.text, ink }));
    // The print SVG is 300 px wide: density scales it to WIDTH.
    await sharp(svg, { density: (72 * WIDTH) / 300 })
      .resize({ width: WIDTH })
      .png({ compressionLevel: 9 })
      .toFile(join(out, "designs", `${design.id}-${variant}.png`));
    console.log(`✔ designs/${design.id}-${variant}.png`);
  }
}

for (const color of ["black", "white"]) {
  for (const side of ["front", "back"]) {
    copyFileSync(join(here, "art", "assets", `shirt-${color}-${side}.png`), join(out, "shirts", `${color}-${side}.png`));
    console.log(`✔ shirts/${color}-${side}.png`);
  }
}
