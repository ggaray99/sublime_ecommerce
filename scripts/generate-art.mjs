// Generates the original mockups used by the demo catalog.
// Scenes are authored as SVG, then rendered to WebP: the die-cut contour uses
// SVG blur filters that are too expensive for browsers to rasterize on scroll.
// Run with `npm run art`. Output goes to public/demo and is committed, so the
// site never depends on external image URLs.
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { C } from "./art/motifs.mjs";
import { scenes } from "./art/scenes.mjs";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "public", "demo");
const assets = join(here, "art", "assets");

/**
 * T-shirt products use the client's photo mockups (scripts/art/assets) with the
 * print composited on the chest (front) or upper back (back view).
 */
const mockup = (options) => ({ mockup: options });

/** Grid of real stickers from the client catalog (public/catalogo/stickers). */
async function renderCollage(codes) {
  const gap = 24;
  const tile = Math.floor((SIZE - gap * 4) / 3);
  const tiles = await Promise.all(
    codes.map((code) => sharp(join(here, "..", "public", "catalogo", "stickers", `${code}.webp`)).resize(tile, tile).toBuffer()),
  );
  return sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: C.coal } }).composite(
    tiles.map((input, index) => ({
      input,
      left: gap + (index % 3) * (tile + gap),
      top: gap + Math.floor(index / 3) * (tile + gap),
    })),
  );
}

const images = {
  // Calcos y stickers

  // Packs
  "products/pack-caos-grafico-1": scenes.packCover({
    title: "CAOS GRÁFICO",
    motifs: ["eye", "smiley", "flame", ["wordBadge", "CAOS"], "bolt", ["starBadge", "100%", "ORIGINAL"], "hand", "comet"],
  }),
  "products/pack-caos-grafico-2": scenes.spread({
    motifs: ["eye", "smiley", "flame", ["wordBadge", "CAOS"], "bolt", ["starBadge", "100%", "ORIGINAL"], "hand", "comet"],
  }),
  "products/pack-tribuna-1": scenes.packCover({
    title: "TRIBUNA",
    bg: "cement",
    card: C.violet,
    motifs: ["ball", "scarf", "jersey", "trophyHands", ["wordBadge", "LOCAL", C.coal, C.acid, 4], ["starBadge", "DE LA", "TRIBUNA", C.coal]],
  }),
  "products/pack-tribuna-2": scenes.spread({
    bg: "dark",
    caption: "PIEZAS DEL PACK",
    motifs: ["ball", "scarf", "jersey", "trophyHands", ["wordBadge", "LOCAL", C.coal, C.acid, 4], ["starBadge", "DE LA", "TRIBUNA", C.coal]],
  }),
  "products/pack-pixel-punk-1": scenes.packCover({
    title: "PIXEL PUNK",
    bg: "plum",
    motifs: ["pixelCritter", "controller", "robot", "pixelHeart", "ufo", ["wordBadge", "PLAY", C.pink, C.coal, 6]],
  }),
  "products/pack-pixel-punk-2": scenes.spread({
    bg: "cement",
    motifs: ["pixelCritter", "controller", "robot", "pixelHeart", "ufo", ["wordBadge", "PLAY", C.pink, C.coal, 6]],
  }),
  "products/pack-garage-1": scenes.packCover({
    title: "GARAGE",
    bg: "dark",
    card: C.cement,
    accent: C.acid,
    motifs: ["car", "helmet", "flame", "bolt", ["wordBadge", "RUTA", C.violet, C.white], ["starBadge", "FULL", "GAS"]],
  }),
  "products/pack-garage-2": scenes.stickerOnHelmet({ motif: "flame" }),
  "products/pack-kawaii-kaos-1": scenes.packCover({
    title: "KAWAII KAOS",
    bg: "deep",
    card: C.cement,
    motifs: ["ronin", "onigiri", "comet", "mutantCat", ["starBadge", "KAWAII", "KAOS", C.pink, C.coal], "rocket"],
  }),
  "products/pack-kawaii-kaos-2": scenes.spread({
    bg: "violet",
    motifs: ["ronin", "onigiri", "comet", "mutantCat", ["starBadge", "KAWAII", "KAOS", C.pink, C.coal], "rocket"],
  }),

  // Indumentaria
  "products/remera-ruido-visual-1": mockup({ shirt: "black", view: "front", motif: "eye", text: "RUIDO VISUAL", bg: "cement" }),
  "products/remera-ruido-visual-2": mockup({ shirt: "black", view: "back", motif: "eye", text: "RUIDO VISUAL", bg: "cement" }),
  "products/remera-otro-planeta-1": mockup({ shirt: "white", view: "front", motif: "planet", text: "OTRO PLANETA", bg: "violet" }),
  "products/remera-otro-planeta-2": mockup({ shirt: "white", view: "back", motif: "planet", text: "OTRO PLANETA", bg: "violet" }),
  "products/remera-gato-mutante-1": mockup({ shirt: "black", view: "front", motif: "mutantCat", text: "MUTANTE", bg: "white" }),
  "products/remera-gato-mutante-2": mockup({ shirt: "black", view: "back", motif: "mutantCat", text: "MUTANTE", bg: "white" }),

  // DTF
  "products/plancha-dtf-laboratorio-1": scenes.dtfSheet({
    title: "LABORATORIO",
    motifs: ["cosmicBeast", "bolt", "eye", "smiley", "flame", "rocket", "planet", "ufo", "robot", "comet", "cassette", "skateGhost"],
  }),
  "products/plancha-dtf-laboratorio-2": scenes.dtfSheet({
    title: "LABORATORIO",
    zoom: true,
    motifs: ["cosmicBeast", "bolt", "eye", "smiley", "flame", "rocket", "planet", "ufo", "robot", "comet", "cassette", "skateGhost"],
  }),
  "products/plancha-dtf-nocturna-1": scenes.dtfSheet({
    title: "NOCTURNA",
    bg: "plum",
    motifs: ["car", "helmet", "ball", "jersey", "record", "mutantCat", "ronin", "controller", "pixelCritter", ["wordBadge", "NOCHE", C.coal, C.acid], ["starBadge", "MODO", "NOCHE", C.plum], "hand"],
  }),
  "products/plancha-dtf-nocturna-2": scenes.dtfSheet({
    title: "NOCTURNA",
    bg: "plum",
    zoom: true,
    motifs: ["car", "helmet", "ball", "jersey", "record", "mutantCat", "ronin", "controller", "pixelCritter", ["wordBadge", "NOCHE", C.coal, C.acid], ["starBadge", "MODO", "NOCHE", C.plum], "hand"],
  }),

  // Vinilos
  "products/vinilo-modular-1": scenes.vinylWall(),
  "products/kit-vinilos-laptop-1": scenes.stickerOnLaptop({ motif: "rocket", extras: ["pixelHeart", ["wordBadge", "PEGÁ"], "planet"], bg: "violet" }),
  "products/kit-vinilos-laptop-2": scenes.vinylSheet({ motifs: ["rocket", "planet", ["wordBadge", "PEGÁ"], "pixelHeart", "bolt", "comet", "smiley"] }),
  "products/kit-vinilos-casco-1": scenes.stickerOnHelmet({ motif: ["wordBadge", "RUTA 00", C.acid, C.coal, -8], bg: "cement" }),
  "products/kit-vinilos-casco-2": scenes.vinylSheet({
    bg: "coal",
    title: "KIT CASCO",
    motifs: [["wordBadge", "RUTA 00", C.acid, C.coal, -8], "flame", "helmet", "bolt", "eye", ["starBadge", "FULL", "GAS"], "car"],
  }),

  // Personalizados
  "products/stickers-a-medida-1": scenes.custom({ motif: "rocket", headline: "TU IDEA" }),
  "products/stickers-a-medida-2": scenes.stickerOnSkate({ motifs: ["rocket", ["wordBadge", "TU LOGO", C.violet, C.white], "smiley"], bg: "violet" }),
  "products/etiquetas-para-tu-marca-1": scenes.labels({}),
  "products/etiquetas-para-tu-marca-2": scenes.packaging({}),

  // Categorías
  "categories/stickers": { collage: ["088", "137", "044", "146", "159", "153", "075", "090", "128"] },
  "categories/packs": scenes.spread({ bg: "acid", caption: "PACKS", motifs: ["controller", "ball", "ronin", "flame", "eye", "car", "pixelHeart", "comet"] }),
  "categories/indumentaria": mockup({ shirt: "black", view: "front", motif: "record", text: "SUBLIME", bg: "violet" }),
  "categories/dtf": scenes.dtfSheet({ bg: "deep", title: "DTF", motifs: ["bolt", "eye", "smiley", "flame", "planet", "rocket", "ufo", "comet", "robot", "cassette", "car", "skateGhost"] }),
  "categories/vinilos": scenes.stickerOnBottle({ motif: "planet", extra: "bolt", bg: "plum" }),
  "categories/personalizados": scenes.custom({ motif: "hand", headline: "TU IDEA" }),

  // Bloque editorial
  "editorial/botella": scenes.stickerOnBottle({ motif: "comet", extra: "smiley", bg: "acid" }),
  "editorial/laptop": scenes.stickerOnLaptop({ motif: "pixelCritter", extras: ["controller", ["wordBadge", "GG"], "ufo"], bg: "coal" }),
  "editorial/casco": scenes.stickerOnHelmet({ motif: "eye", bg: "violet" }),
  "editorial/packaging": scenes.packaging({ bg: "cement" }),
  "editorial/remera": mockup({ shirt: "white", view: "front", motif: "cosmicBeast", text: "BESTIA", bg: "plum" }),
};

const SIZE = 1200;
const renderSvg = (content) => sharp(Buffer.from(content), { density: (72 * SIZE) / 800 }).resize(SIZE, SIZE);

async function renderMockup({ shirt, view, motif, text, bg }) {
  const garmentFile = join(assets, `shirt-${shirt}-${view}.png`);
  // Locate the garment inside the transparent 1080 × 1080 photo.
  const { info } = await sharp(garmentFile).trim().toBuffer({ resolveWithObject: true });
  const box = { left: -info.trimOffsetLeft, top: -info.trimOffsetTop, width: info.width, height: info.height };
  const front = view === "front";
  const printWidth = Math.round(box.width * (front ? 0.4 : 0.34));
  const ink = shirt === "black" ? C.acid : C.coal;
  const printPng = await sharp(Buffer.from(scenes.shirtPrint({ motif, text, ink })), { density: 288 })
    .resize({ width: printWidth })
    .png()
    .toBuffer();
  const garment = await sharp(garmentFile)
    .composite([
      {
        input: printPng,
        left: Math.round(box.left + box.width / 2 - printWidth / 2),
        top: Math.round(box.top + box.height * (front ? 0.27 : 0.25)),
        // Multiply lets the fabric folds show through prints on white cotton.
        blend: shirt === "white" ? "multiply" : "over",
      },
    ])
    .png()
    .toBuffer();
  const caption = front ? "REMERA ESTAMPADA" : "VISTA TRASERA";
  const backdrop = await renderSvg(scenes.backdrop({ bg, caption })).png().toBuffer();
  // Crop to the garment (plus hanger) and scale it to fill most of the frame.
  const fitted = await sharp(garment)
    .extract(box)
    .resize({ height: 1000 })
    .toBuffer({ resolveWithObject: true });
  return sharp(backdrop).composite([
    { input: fitted.data, left: Math.round((SIZE - fitted.info.width) / 2), top: Math.round((SIZE - 1000) / 2) + 30 },
  ]);
}

rmSync(root, { recursive: true, force: true });
let bytes = 0;
for (const [name, content] of Object.entries(images)) {
  const file = join(root, `${name}.webp`);
  mkdirSync(dirname(file), { recursive: true });
  const image =
    typeof content === "string"
      ? renderSvg(content)
      : content.collage
        ? await renderCollage(content.collage)
        : await renderMockup(content.mockup);
  const info = await image.webp({ quality: 82 }).toFile(file);
  bytes += info.size;
}
console.log(`Generated ${Object.keys(images).length} images (${Math.round(bytes / 1024)} KB) in public/demo`);
