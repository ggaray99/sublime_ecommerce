// Product mockup scenes (800 × 800) built from the original motifs.
import { C, motifs } from "./motifs.mjs";

const font = `font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900"`;
const mono = `font-family="Consolas, 'Courier New', monospace" font-weight="700"`;

const defs = `
<defs>
  <filter id="cut" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="7" result="blur"/>
    <feComponentTransfer in="blur" result="mask"><feFuncA type="linear" slope="14" intercept="-1.2"/></feComponentTransfer>
    <feFlood flood-color="#FFFFFF"/><feComposite in2="mask" operator="in" result="border"/>
    <feGaussianBlur in="mask" stdDeviation="6" result="shadowBlur"/>
    <feOffset in="shadowBlur" dx="3" dy="8" result="shadowOffset"/>
    <feFlood flood-color="#0F172A" flood-opacity=".38"/><feComposite in2="shadowOffset" operator="in" result="shadow"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="border"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="drop" x="-20%" y="-20%" width="140%" height="150%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="14"/><feOffset dx="0" dy="22" result="o"/>
    <feFlood flood-color="#0F172A" flood-opacity=".35"/><feComposite in2="o" operator="in"/>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <pattern id="dotsLight" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.7" fill="#0F172A" opacity=".13"/></pattern>
  <pattern id="dotsDark" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.7" fill="#FFFFFF" opacity=".1"/></pattern>
  <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#FFFFFF" stroke-opacity=".07" stroke-width="2"/></pattern>
  <pattern id="gridInk" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#7C3AED" stroke-opacity=".18" stroke-width="1.5"/></pattern>
  <pattern id="checker" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="28" height="28" fill="#FFFFFF"/><rect width="14" height="14" fill="#E9EAEE"/><rect x="14" y="14" width="14" height="14" fill="#E9EAEE"/></pattern>
  <pattern id="knit" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8 L4 0 L8 8" fill="none" stroke="#000000" stroke-opacity=".06" stroke-width="1.4"/></pattern>
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".55"/><stop offset=".35" stop-color="#FFFFFF" stop-opacity=".08"/><stop offset=".65" stop-color="#FFFFFF" stop-opacity=".18"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
  <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9CA3AF"/><stop offset=".25" stop-color="#F3F4F6"/><stop offset=".55" stop-color="#D1D5DB"/><stop offset="1" stop-color="#6B7280"/></linearGradient>
  <linearGradient id="lid" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3F3F46"/><stop offset="1" stop-color="#18181B"/></linearGradient>
  <radialGradient id="spot" cx=".5" cy=".42" r=".65"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".22"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
</defs>`;

// Backdrops follow the brand: black, white, light gray and cyan.
// Legacy keys map onto the new palette (`violet` → cyan, `acid` → white).
const backgrounds = {
  cement: { fill: C.cement, pattern: "dotsLight", ink: C.coal },
  white: { fill: "#FFFFFF", pattern: "dotsLight", ink: C.coal },
  coal: { fill: C.coal, pattern: "grid", ink: C.white },
  dark: { fill: C.dark, pattern: "dotsDark", ink: C.white },
  violet: { fill: C.acid, pattern: "dotsLight", ink: C.coal },
  plum: { fill: C.plum, pattern: "grid", ink: C.white },
  deep: { fill: C.violet, pattern: "dotsDark", ink: C.white },
  acid: { fill: "#FFFFFF", pattern: "dotsLight", ink: C.coal },
};

const background = (kind) => {
  const b = backgrounds[kind];
  return `<rect width="800" height="800" fill="${b.fill}"/><rect width="800" height="800" fill="url(#${b.pattern})"/><rect width="800" height="800" fill="url(#spot)"/>`;
};

const brand = (kind, caption) => {
  const ink = backgrounds[kind].ink;
  return `<g ${mono} font-size="17" fill="${ink}" opacity=".78">
    <text x="36" y="52">SUBLIME® / ${caption}</text>
    <text x="764" y="764" text-anchor="end">IMAGEN DEMO</text>
  </g>`;
};

const svg = (body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" role="img" aria-label="${label}">${defs}${body}</svg>\n`;

/** Places a motif as a die-cut sticker. */
export const sticker = (motif, x, y, scale = 1, rot = 0) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${scale}) translate(-100 -100)" filter="url(#cut)">${motif}</g>`;

/** Places a motif as a flat print (no white contour). */
const print = (motif, x, y, scale = 1, rot = 0, opacity = 1) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${scale}) translate(-100 -100)" opacity="${opacity}">${motif}</g>`;

const m = (name, ...args) => motifs[name](...args);

export const scenes = {
  /** Empty branded backdrop used behind the client's T-shirt photo mockups. */
  backdrop({ bg = "cement", caption }) {
    return svg(`${background(bg)}${brand(bg, caption)}`, "Fondo de producto");
  },

  /** Transparent print artwork placed on the T-shirt mockups. */
  shirtPrint({ motif, text, ink }) {
    const lines = text ? text.split(" ") : [];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 380" width="300" height="380">${defs}
      ${print(m(...[].concat(motif)), 150, 112, 1.05)}
      ${lines.map((line, i) => `<text x="150" y="${282 + i * 56}" text-anchor="middle" ${font} font-size="${line.length > 7 ? 44 : 54}" letter-spacing="-2" fill="${ink}">${line}</text>`).join("")}
    </svg>`;
  },

  stickerCover({ motif, bg = "violet", rot = -6, caption = "CALCO TROQUELADO", liner = false }) {
    const art = m(...[].concat(motif));
    const linerSvg = liner
      ? `<g transform="rotate(${rot / 2} 400 410)" filter="url(#drop)"><rect x="150" y="160" width="500" height="500" rx="34" fill="#FFFFFF"/><rect x="150" y="160" width="500" height="500" rx="34" fill="url(#dotsLight)" opacity=".5"/><path d="M150 560 L650 520" stroke="#D4D4D8" stroke-width="3" stroke-dasharray="10 9"/></g>`
      : "";
    return svg(
      `${background(bg)}${linerSvg}${sticker(art, 400, 405, liner ? 2.15 : 2.6, rot)}${brand(bg, caption)}`,
      "Calco troquelado de demostración",
    );
  },

  stickerOnLaptop({ motif, extras = ["bolt", ["wordBadge", "PEGÁ"]], bg = "cement" }) {
    const ex = extras.map((e) => m(...[].concat(e)));
    return svg(
      `${background(bg)}
      <g transform="rotate(-5 400 420)" filter="url(#drop)">
        <rect x="110" y="170" width="580" height="400" rx="26" fill="url(#lid)"/>
        <rect x="110" y="170" width="580" height="400" rx="26" fill="url(#sheen)" opacity=".35"/>
        <rect x="90" y="566" width="620" height="26" rx="10" fill="#52525B"/>
        <rect x="330" y="566" width="140" height="10" rx="5" fill="#3F3F46"/>
      </g>
      <g transform="rotate(-5 400 420)">
        ${sticker(m(...[].concat(motif)), 360, 360, 1.45, -8)}
        ${ex[0] ? sticker(ex[0], 590, 260, 0.62, 14) : ""}
        ${ex[1] ? sticker(ex[1], 560, 470, 0.85, -4) : ""}
        ${ex[2] ? sticker(ex[2], 190, 480, 0.6, 10) : ""}
      </g>
      ${brand(bg, "APLICACIÓN EN LAPTOP")}`,
      "Calcos de demostración aplicados sobre una laptop",
    );
  },

  stickerOnBottle({ motif, extra = "smiley", bg = "violet" }) {
    return svg(
      `${background(bg)}
      <ellipse cx="400" cy="730" rx="150" ry="22" fill="#0F172A" opacity=".3"/>
      <g filter="url(#drop)">
        <rect x="335" y="70" width="130" height="80" rx="16" fill="${C.coal}"/>
        <rect x="350" y="140" width="100" height="30" fill="#4B5563"/>
        <path d="M300 230 Q300 170 360 165 L440 165 Q500 170 500 230 L500 690 Q500 728 460 728 L340 728 Q300 728 300 690Z" fill="url(#steel)"/>
        <path d="M330 220 L330 690" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="12" stroke-linecap="round"/>
      </g>
      ${sticker(m(...[].concat(motif)), 405, 420, 0.98, -5)}
      ${sticker(m(...[].concat(extra)), 430, 620, 0.5, 12)}
      ${brand(bg, "APLICACIÓN EN BOTELLA")}`,
      "Calcos de demostración aplicados sobre una botella térmica",
    );
  },

  stickerOnHelmet({ motif, bg = "acid" }) {
    return svg(
      `${background(bg)}
      <ellipse cx="400" cy="690" rx="250" ry="30" fill="#0F172A" opacity=".28"/>
      <g filter="url(#drop)">
        <path d="M140 560 Q120 200 400 170 Q660 170 670 470 L670 560 Q670 640 600 640 L210 640 Q140 640 140 560Z" fill="${C.coal}"/>
        <path d="M400 300 Q620 300 640 450 L640 520 L400 520 Q350 520 350 470 L350 350 Q350 300 400 300Z" fill="${C.deep}"/>
        <path d="M420 330 Q570 330 610 430" fill="none" stroke="#FFFFFF" stroke-opacity=".45" stroke-width="16" stroke-linecap="round"/>
        <path d="M140 570 L670 570" stroke="${C.acid}" stroke-width="14"/>
        <path d="M200 250 Q260 205 330 196" fill="none" stroke="#FFFFFF" stroke-opacity=".25" stroke-width="18" stroke-linecap="round"/>
      </g>
      ${sticker(m(...[].concat(motif)), 245, 410, 0.95, -12)}
      ${brand(bg, "APLICACIÓN EN CASCO")}`,
      "Calcos de demostración aplicados sobre un casco",
    );
  },

  stickerOnSkate({ motifs: list, bg = "coal" }) {
    const pos = [
      [400, 250, 0.9, -8],
      [380, 470, 0.75, 10],
      [420, 640, 0.6, -14],
    ];
    return svg(
      `${background(bg)}
      <g transform="rotate(-18 400 430)" filter="url(#drop)">
        <rect x="290" y="40" width="220" height="760" rx="110" fill="${C.violet}"/>
        <rect x="290" y="40" width="220" height="760" rx="110" fill="url(#sheen)" opacity=".4"/>
        ${[160, 680].map((y) => `<circle cx="345" cy="${y}" r="8" fill="${C.coal}"/><circle cx="455" cy="${y}" r="8" fill="${C.coal}"/>`).join("")}
      </g>
      <g transform="rotate(-18 400 430)">
        ${list.map((name, i) => sticker(m(...[].concat(name)), ...pos[i])).join("")}
      </g>
      ${brand(bg, "APLICACIÓN EN SKATE")}`,
      "Calcos de demostración aplicados sobre una tabla de skate",
    );
  },

  packCover({ motifs: list, title, bg = "violet", card = C.coal, accent = C.acid }) {
    const slots = [
      [300, 330, 0.95, -10],
      [510, 320, 0.85, 8],
      [290, 520, 0.8, 6],
      [500, 520, 0.9, -6],
      [405, 425, 0.62, 14],
      [600, 440, 0.5, -18],
      [210, 430, 0.5, 18],
      [405, 610, 0.5, -4],
    ];
    const cardInk = card === C.coal || card === C.plum ? C.white : C.coal;
    return svg(
      `${background(bg)}
      <g transform="rotate(-3 400 420)">
        <g filter="url(#drop)"><rect x="140" y="120" width="520" height="610" rx="18" fill="${card}"/></g>
        <rect x="140" y="120" width="520" height="610" rx="18" fill="url(#grid)"/>
        <rect x="140" y="120" width="520" height="92" rx="18" fill="${accent}"/>
        <rect x="140" y="180" width="520" height="32" fill="${accent}"/>
        <circle cx="400" cy="148" r="12" fill="${backgrounds[bg].fill === C.acid ? C.coal : backgrounds[bg].fill}"/>
        <text x="172" y="196" ${font} font-size="34" fill="${C.coal}" letter-spacing="-1">${title}</text>
        <text x="628" y="196" text-anchor="end" ${mono} font-size="16" fill="${C.coal}">${list.length} PIEZAS</text>
        ${list.map((name, i) => sticker(m(...[].concat(name)), ...slots[i])).join("")}
        <text x="172" y="708" ${mono} font-size="15" fill="${cardInk}" opacity=".8">PACK DEMO · DISEÑOS ORIGINALES</text>
        <rect x="140" y="120" width="520" height="610" rx="18" fill="url(#sheen)" opacity=".55"/>
        <rect x="150" y="128" width="500" height="10" rx="5" fill="#FFFFFF" opacity=".35"/>
      </g>
      ${brand(bg, "PACK DE STICKERS")}`,
      `Pack de stickers de demostración: ${title}`,
    );
  },

  spread({ motifs: list, bg = "cement", caption = "PIEZAS DEL PACK" }) {
    const slots = [
      [210, 220, 1.0, -12],
      [450, 190, 0.85, 9],
      [640, 280, 0.8, -6],
      [250, 470, 0.9, 7],
      [500, 430, 1.0, -9],
      [660, 560, 0.75, 14],
      [230, 680, 0.7, -16],
      [450, 650, 0.8, 5],
    ];
    return svg(
      `${background(bg)}${list.map((name, i) => sticker(m(...[].concat(name)), ...slots[i])).join("")}${brand(bg, caption)}`,
      "Stickers de demostración distribuidos sobre una superficie",
    );
  },

  dtfSheet({ motifs: list, bg = "coal", title = "PLANCHA DTF", zoom = false }) {
    const cols = 3;
    const cells = list
      .map((name, i) => {
        const x = 268 + (i % cols) * 132;
        const y = 236 + Math.floor(i / cols) * 132;
        return print(m(...[].concat(name)), x, y, 0.56, ((i * 37) % 9) - 4);
      })
      .join("");
    const cross = (x, y) => `<g stroke="${C.coal}" stroke-width="2"><circle cx="${x}" cy="${y}" r="9" fill="none"/><path d="M${x - 15} ${y}H${x + 15}M${x} ${y - 15}V${y + 15}"/></g>`;
    const sheet = `
      <g transform="rotate(3 400 420)">
        <g filter="url(#drop)"><rect x="180" y="110" width="440" height="640" fill="url(#checker)"/></g>
        <rect x="180" y="110" width="440" height="640" fill="none" stroke="#D4D4D8" stroke-width="2"/>
        ${cross(204, 134)}${cross(596, 134)}${cross(204, 726)}${cross(596, 726)}
        <text x="400" y="146" text-anchor="middle" ${mono} font-size="15" fill="${C.coal}">${title} · ARCHIVO DEMO</text>
        ${cells}
        <path d="M620 650 L620 750 L520 750Z" fill="#FFFFFF"/>
        <path d="M620 650 L520 750 L548 680Z" fill="#E4E4E7" stroke="#D4D4D8" stroke-width="2"/>
        <text x="400" y="736" text-anchor="middle" ${mono} font-size="13" fill="${C.coal}" opacity=".7">NO APTO PARA PRODUCCIÓN</text>
      </g>`;
    const body = zoom ? `<g transform="translate(400 400) scale(1.7) translate(-400 -330)">${sheet}</g>` : sheet;
    return svg(
      `${background(bg)}${body}${brand(bg, zoom ? "DETALLE DE IMPRESIÓN" : "PLANCHA DTF")}`,
      zoom ? "Detalle de diseños en una plancha DTF de demostración" : "Plancha DTF de demostración con varios diseños dispuestos",
    );
  },

  vinylWall() {
    const shapes = `
      <circle cx="300" cy="250" r="90" fill="${C.violet}"/>
      <path d="M390 250 A90 90 0 0 1 570 250Z" fill="${C.acid}"/>
      <rect x="390" y="262" width="180" height="90" fill="${C.plum}"/>
      <path d="M210 360 L390 360 L300 470Z" fill="${C.acid}"/>
      <path d="M580 160 L640 160 L640 360 L580 360Z" fill="${C.violet}"/>
      <circle cx="610" cy="420" r="30" fill="${C.coal}"/>
      <path d="M402 380 Q470 340 560 400" fill="none" stroke="${C.coal}" stroke-width="16" stroke-linecap="round"/>`;
    return svg(
      `<rect width="800" height="800" fill="#ECEAE6"/><rect width="800" height="620" fill="#E5E7EB"/>
      <rect y="620" width="800" height="180" fill="#C8C2B8"/><path d="M0 620 H800" stroke="#A8A29E" stroke-width="6"/>
      <g opacity=".95">${shapes}</g>
      <g filter="url(#drop)">
        <path d="M150 560 Q150 520 190 520 L610 520 Q650 520 650 560 L650 650 L150 650Z" fill="${C.coal}"/>
        <rect x="120" y="560" width="70" height="120" rx="22" fill="#1E293B"/><rect x="610" y="560" width="70" height="120" rx="22" fill="#1E293B"/>
        <rect x="170" y="600" width="460" height="70" rx="12" fill="#1E293B"/>
        <rect x="250" y="540" width="110" height="70" rx="12" fill="${C.acid}"/>
        <rect x="160" y="680" width="18" height="40" fill="#111827"/><rect x="622" y="680" width="18" height="40" fill="#111827"/>
      </g>
      <g filter="url(#drop)">
        <path d="M702 520 L722 520 L716 610 L708 610Z" fill="#A16207"/>
        <path d="M712 520 Q660 470 690 410 Q714 470 712 520 Q740 450 770 440 Q760 500 712 520Z" fill="#15803D"/>
        <rect x="684" y="600" width="56" height="70" rx="6" fill="${C.violet}"/>
      </g>
      ${brand("white", "VINILO DECORATIVO")}`,
      "Vinilo decorativo geométrico de demostración aplicado en una pared",
    );
  },

  vinylSheet({ motifs: list, bg = "plum", title = "PLANCHA DE VINILOS" }) {
    const slots = [
      [290, 280, 0.7, -6],
      [500, 270, 0.6, 8],
      [280, 470, 0.62, 10],
      [510, 470, 0.72, -4],
      [395, 380, 0.42, 0],
      [300, 640, 0.5, 6],
      [500, 640, 0.5, -10],
    ];
    return svg(
      `${background(bg)}
      <g transform="rotate(-4 400 430)">
        <g filter="url(#drop)"><rect x="170" y="130" width="460" height="620" rx="14" fill="#FFFFFF"/></g>
        <rect x="170" y="130" width="460" height="620" rx="14" fill="url(#dotsLight)" opacity=".6"/>
        <text x="200" y="176" ${mono} font-size="16" fill="${C.coal}">${title} · DEMO</text>
        <path d="M200 192 H600" stroke="${C.coal}" stroke-width="2" stroke-dasharray="6 6"/>
        ${list.map((name, i) => sticker(m(...[].concat(name)), ...slots[i])).join("")}
      </g>
      ${brand(bg, "PLANCHA CON CORTE")}`,
      "Plancha de vinilos adhesivos de demostración",
    );
  },

  custom({ motif, headline = "TU IDEA" }) {
    const art = m(...[].concat(motif));
    return svg(
      `<rect width="800" height="800" fill="#FAFAF9"/><rect width="800" height="800" fill="url(#gridInk)"/>
      <g transform="rotate(-4 230 420)">
        <rect x="80" y="250" width="300" height="320" fill="#FFFFFF" stroke="${C.coal}" stroke-width="3"/>
        <g opacity=".22">${print(art, 230, 405, 1.15)}</g>
        <rect x="104" y="274" width="252" height="272" fill="none" stroke="${C.violet}" stroke-width="3" stroke-dasharray="14 10"/>
        <text x="96" y="236" ${mono} font-size="18" fill="${C.coal}">BOCETO / REFERENCIA</text>
      </g>
      <path d="M400 420 L470 420" stroke="${C.coal}" stroke-width="12" stroke-linecap="round"/>
      <path d="M460 392 L496 420 L460 448Z" fill="${C.coal}"/>
      ${sticker(art, 620, 420, 1.15, 6)}
      <text x="80" y="130" ${font} font-size="76" fill="${C.coal}" letter-spacing="-5">${headline}</text>
      <text x="80" y="190" ${font} font-size="44" fill="${C.violet}" letter-spacing="-2">A MEDIDA</text>
      <rect x="80" y="660" width="330" height="56" fill="${C.acid}" stroke="${C.coal}" stroke-width="3"/>
      <text x="100" y="697" ${mono} font-size="20" fill="${C.coal}">FORMATO + CANTIDAD</text>
      ${brand("white", "ENCARGO PERSONALIZADO")}`,
      "Ejemplo de encargo personalizado: de un boceto a un calco",
    );
  },

  labels({ bg = "violet" }) {
    const label = (x, y, r, fill, text, ink) =>
      `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${C.coal}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="${r - 10}" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="4 5"/><text x="${x}" y="${y - 2}" text-anchor="middle" ${font} font-size="${r * 0.32}" fill="${ink}">${text}</text><text x="${x}" y="${y + r * 0.3}" text-anchor="middle" ${mono} font-size="${r * 0.17}" fill="${ink}">LOGO AQUÍ</text>`;
    return svg(
      `${background(bg)}
      <g transform="rotate(-6 330 420)">
        <g filter="url(#drop)"><rect x="90" y="150" width="440" height="560" rx="12" fill="#FFFFFF"/></g>
        ${[0, 1, 2].map((r) => [0, 1].map((c) => label(210 + c * 200, 260 + r * 170, 72, [C.acid, C.cement, C.coal][(r + c) % 3], "TU MARCA", [C.coal, C.violet, C.acid][(r + c) % 3])).join("")).join("")}
      </g>
      <g filter="url(#drop)">
        <rect x="500" y="430" width="230" height="290" rx="20" fill="#B45309"/>
        <rect x="500" y="430" width="230" height="290" rx="20" fill="url(#dotsDark)"/>
        <rect x="520" y="400" width="190" height="50" rx="10" fill="${C.coal}"/>
      </g>
      ${label(615, 580, 80, C.acid, "TU MARCA", C.coal)}
      ${brand(bg, "ETIQUETAS A MEDIDA")}`,
      "Etiquetas personalizadas de demostración para packaging",
    );
  },

  packaging({ bg = "cement" }) {
    return svg(
      `${background(bg)}
      <g filter="url(#drop)">
        <path d="M150 340 L400 250 L650 340 L650 620 L400 710 L150 620Z" fill="#C08A55"/>
        <path d="M150 340 L400 430 L400 710 L150 620Z" fill="#A87543"/>
        <path d="M400 430 L650 340 L650 620 L400 710Z" fill="#C99460"/>
        <path d="M150 340 L400 250 L650 340 L400 430Z" fill="#D9A673"/>
        <path d="M270 296 L520 386 L520 430 L270 340Z" fill="#E7E5E4" opacity=".8"/>
      </g>
      ${sticker(m("starBadge", "HECHO", "PARA VOS"), 470, 520, 0.9, 8)}
      ${sticker(m("wordBadge", "FRÁGIL", C.violet, C.white, -4), 260, 560, 0.6, -6)}
      ${sticker(m("smiley"), 420, 330, 0.42, -10)}
      ${brand(bg, "APLICACIÓN EN PACKAGING")}`,
      "Caja de envío con calcos de demostración aplicados",
    );
  },
};
