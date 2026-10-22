// Original sticker motifs for the Sublime demo catalog.
// Every motif is drawn inside a 200 × 200 box centered at (100, 100) with
// solid fills, so the die-cut filter can trace a white contour around it.

// Palette derived from the client brand (black, white, cyan #35BDF2).
// Key names are kept from the first iteration so scene code stays stable:
// `acid` is now the brand cyan and `violet`/`deep` are darker cyan blues.
export const C = {
  acid: "#35BDF2",
  violet: "#1673B8",
  deep: "#0B4A75",
  coal: "#000000",
  dark: "#1A1A1A",
  cement: "#F2F2F2",
  plum: "#0D0D0D",
  white: "#FFFFFF",
  pink: "#FF4FD8",
  orange: "#FF7A1A",
  yellow: "#FFE14D",
  red: "#FF3B3B",
  cyan: "#A5E6FF",
  skin: "#FFD7B5",
};

const ink = `stroke="${C.coal}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"`;
const font = `font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900"`;

const star4 = (x, y, r, fill = C.acid) =>
  `<path d="M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z" fill="${fill}" ${ink}/>`;

const eye = (x, y, r, iris = C.coal) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.white}" ${ink}/><circle cx="${x + r * 0.15}" cy="${y + r * 0.1}" r="${r * 0.5}" fill="${iris}"/><circle cx="${x + r * 0.32}" cy="${y - r * 0.15}" r="${r * 0.18}" fill="${C.white}"/>`;

export const motifs = {
  cosmicBeast: () => `
    <g ${ink}>
      <path d="M58 66 L36 16 L82 50Z" fill="${C.acid}"/>
      <path d="M142 66 L164 16 L118 50Z" fill="${C.acid}"/>
      <path d="M40 150 Q14 160 18 186 Q40 178 52 166Z" fill="${C.violet}"/>
      <path d="M160 150 Q186 160 182 186 Q160 178 148 166Z" fill="${C.violet}"/>
      <path d="M100 40 C152 40 172 80 168 120 C164 162 136 184 100 184 C64 184 36 162 32 120 C28 80 48 40 100 40Z" fill="${C.violet}"/>
    </g>
    <circle cx="58" cy="148" r="9" fill="${C.deep}"/><circle cx="146" cy="140" r="12" fill="${C.deep}"/><circle cx="132" cy="166" r="6" fill="${C.deep}"/>
    ${eye(68, 96, 15)}${eye(132, 96, 15)}${eye(100, 70, 19, C.deep)}
    <path d="M60 128 Q100 168 140 128Z" fill="${C.coal}" ${ink}/>
    <path d="M72 131 L80 145 L88 134Z M112 134 L120 145 L128 131Z" fill="${C.white}"/>
    <path d="M90 152 Q100 160 110 152 Q100 148 90 152Z" fill="${C.pink}"/>
    ${star4(22, 52, 12)}${star4(178, 64, 10, C.yellow)}${star4(170, 112, 7)}`,

  mutantCat: () => `
    <g ${ink}>
      <path d="M38 76 L30 18 L78 50 Q100 42 122 50 L170 18 L162 76 Q182 118 160 154 Q136 186 100 186 Q64 186 40 154 Q18 118 38 76Z" fill="${C.acid}"/>
      <path d="M44 34 L60 50 L48 64Z M156 34 L140 50 L152 64Z" fill="${C.pink}"/>
    </g>
    <path d="M56 96 L76 104 M144 96 L124 104 M90 60 L100 74 L110 60" stroke="${C.deep}" stroke-width="6" fill="none" stroke-linecap="round"/>
    <g ${ink}>
      <ellipse cx="72" cy="116" rx="20" ry="17" fill="${C.yellow}"/><ellipse cx="128" cy="116" rx="20" ry="17" fill="${C.yellow}"/>
      <ellipse cx="100" cy="82" rx="11" ry="9" fill="${C.violet}"/>
    </g>
    <path d="M72 102 Q66 116 72 130 Q78 116 72 102Z M128 102 Q122 116 128 130 Q134 116 128 102Z" fill="${C.coal}"/>
    <circle cx="100" cy="82" r="4" fill="${C.coal}"/>
    <path d="M90 142 L100 150 L110 142Z" fill="${C.pink}" ${ink}/>
    <path d="M100 150 Q86 164 74 154 M100 150 Q114 164 126 154" fill="none" ${ink}/>
    <path d="M112 160 Q118 178 130 168 Q124 160 116 158Z" fill="${C.pink}" ${ink}/>
    <path d="M20 128 L48 132 M18 144 L48 140 M180 128 L152 132 M182 144 L152 140" ${ink}/>
    <path d="M146 64 L158 76 M158 64 L146 76" stroke="${C.coal}" stroke-width="4" stroke-linecap="round"/>`,

  ronin: () => `
    <g ${ink}>
      <path d="M30 104 L18 60 L48 70 L44 28 L76 52 L92 14 L110 48 L140 20 L142 62 L178 48 L166 92 L186 104 L160 118 Z" fill="${C.plum}"/>
      <path d="M48 96 Q48 176 100 182 Q152 176 152 96 Q100 70 48 96Z" fill="${C.skin}"/>
      <path d="M44 86 L156 86 L156 104 L44 104Z" fill="${C.acid}"/>
      <path d="M156 92 Q182 92 190 118 Q172 108 160 112Z M154 100 Q172 118 170 140 Q160 120 150 108Z" fill="${C.acid}"/>
      <path d="M48 104 L62 112 L58 128 L48 124Z M152 104 L138 112 L142 128 L152 124Z" fill="${C.plum}"/>
    </g>
    <circle cx="100" cy="95" r="5" fill="${C.coal}"/>
    <g ${ink}>
      <path d="M58 122 Q72 110 88 120 L88 146 Q72 154 60 144Z" fill="${C.white}"/>
      <path d="M142 122 Q128 110 112 120 L112 146 Q128 154 140 144Z" fill="${C.white}"/>
    </g>
    <ellipse cx="76" cy="134" rx="10" ry="13" fill="${C.violet}"/><ellipse cx="124" cy="134" rx="10" ry="13" fill="${C.violet}"/>
    <ellipse cx="76" cy="137" rx="5" ry="7" fill="${C.coal}"/><ellipse cx="124" cy="137" rx="5" ry="7" fill="${C.coal}"/>
    <circle cx="80" cy="128" r="4" fill="${C.white}"/><circle cx="128" cy="128" r="4" fill="${C.white}"/>
    <path d="M54 118 L90 114 M146 118 L110 114" stroke="${C.coal}" stroke-width="6" stroke-linecap="round"/>
    <path d="M92 164 Q100 170 108 164" fill="none" stroke="${C.coal}" stroke-width="4" stroke-linecap="round"/>
    <path d="M62 152 L72 156 M138 152 L128 156" stroke="${C.pink}" stroke-width="5" stroke-linecap="round"/>`,

  ball: () => `
    <g ${ink}>
      <path d="M16 72 L46 78 M10 100 L44 100 M16 128 L46 122" fill="none"/>
      <circle cx="112" cy="100" r="70" fill="${C.white}"/>
    </g>
    <path d="M112 74 L136 92 L127 120 L97 120 L88 92Z" fill="${C.coal}"/>
    <path d="M112 30 L112 50 L136 92 M88 92 L66 80 L52 64 M136 92 L160 80 L176 74 M127 120 L146 144 L150 160 M97 120 L78 144 L74 160 M112 50 L88 40 M112 50 L136 40" fill="none" stroke="${C.coal}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M60 58 Q66 46 80 36 L92 46 L88 62 L68 72Z M164 58 Q158 46 144 36 L132 46 L136 62 L156 72Z M64 152 L80 148 L92 162 Q76 160 64 152Z M160 152 L144 148 L132 162 Q148 160 160 152Z" fill="${C.coal}"/>
    <path d="M60 60 Q78 30 112 30" fill="none" stroke="${C.white}" stroke-width="7" stroke-linecap="round" opacity=".7"/>
    <g ${ink}><path d="M36 150 L188 150 L182 184 L42 184Z" fill="${C.violet}"/></g>
    <text x="112" y="177" text-anchor="middle" ${font} font-size="25" fill="${C.acid}">DE BARRIO</text>`,

  car: () => `
    <g ${ink}>
      <path d="M14 128 L22 98 Q60 92 74 72 Q100 56 134 62 Q156 68 166 92 L186 98 Q192 112 188 128Z" fill="${C.acid}"/>
      <path d="M80 76 Q100 64 126 68 L132 92 L76 92Z" fill="${C.cyan}"/>
      <path d="M104 68 L106 92" fill="none"/>
      <path d="M26 112 L60 112 Q50 100 70 102 Q60 116 86 114 L96 120 L40 122Z" fill="${C.orange}"/>
      <circle cx="54" cy="130" r="20" fill="${C.coal}"/><circle cx="150" cy="130" r="20" fill="${C.coal}"/>
    </g>
    <circle cx="54" cy="130" r="8" fill="${C.cement}"/><circle cx="150" cy="130" r="8" fill="${C.cement}"/>
    <path d="M168 104 L184 104" stroke="${C.yellow}" stroke-width="7" stroke-linecap="round"/>
    <g ${ink}><path d="M28 154 L178 154 L170 184 L20 184Z" fill="${C.coal}"/></g>
    <text x="99" y="178" text-anchor="middle" ${font} font-size="22" fill="${C.acid}" transform="skewX(-12) translate(36 0)">TURBO CLUB</text>
    <path d="M8 70 L42 70 M2 84 L28 84 M24 56 L58 56" stroke="${C.violet}" stroke-width="6" stroke-linecap="round"/>`,

  skateGhost: () => `
    <g ${ink}>
      <path d="M52 132 L52 76 Q52 22 102 22 Q152 22 152 76 L152 132 L138 120 L124 134 L110 120 L96 134 L82 120 L68 134Z" fill="${C.cement}"/>
      <path d="M152 70 Q178 64 182 40 Q190 60 172 84 Q164 92 152 90Z" fill="${C.cement}"/>
    </g>
    <ellipse cx="84" cy="70" rx="10" ry="14" fill="${C.coal}"/><ellipse cx="122" cy="70" rx="10" ry="14" fill="${C.coal}"/>
    <circle cx="87" cy="64" r="3.5" fill="${C.white}"/><circle cx="125" cy="64" r="3.5" fill="${C.white}"/>
    <path d="M90 98 Q103 110 116 98" fill="none" stroke="${C.coal}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="70" cy="92" r="6" fill="${C.pink}" opacity=".8"/><circle cx="136" cy="92" r="6" fill="${C.pink}" opacity=".8"/>
    <g ${ink}>
      <path d="M18 150 Q24 140 40 142 L164 142 Q180 140 186 150 Q180 160 164 158 L40 158 Q24 160 18 150Z" fill="${C.violet}"/>
      <circle cx="54" cy="172" r="10" fill="${C.acid}"/><circle cx="150" cy="172" r="10" fill="${C.acid}"/>
    </g>
    <path d="M60 150 L140 150" stroke="${C.acid}" stroke-width="4" stroke-dasharray="10 8"/>
    <path d="M4 108 L30 108 M8 124 L36 124" stroke="${C.coal}" stroke-width="5" stroke-linecap="round"/>`,

  cassette: () => `
    <g ${ink}>
      <rect x="14" y="44" width="172" height="116" rx="12" fill="${C.violet}"/>
      <rect x="32" y="58" width="136" height="58" rx="6" fill="${C.acid}"/>
      <rect x="58" y="78" width="84" height="28" rx="14" fill="${C.coal}"/>
      <path d="M52 160 L64 132 L136 132 L148 160Z" fill="${C.deep}"/>
    </g>
    <circle cx="76" cy="92" r="9" fill="${C.white}"/><circle cx="124" cy="92" r="9" fill="${C.white}"/>
    <path d="M76 85 L76 99 M69 92 L83 92 M124 85 L124 99 M117 92 L131 92" stroke="${C.coal}" stroke-width="3"/>
    <text x="100" y="74" text-anchor="middle" ${font} font-size="13" fill="${C.coal}">LADO A · RUIDO</text>
    <circle cx="30" cy="144" r="5" fill="${C.coal}"/><circle cx="170" cy="144" r="5" fill="${C.coal}"/>
    <g ${ink}>
      <path d="M158 40 L158 6 L184 0 L184 30" fill="none"/>
      <ellipse cx="150" cy="40" rx="10" ry="8" fill="${C.pink}"/><ellipse cx="176" cy="32" rx="10" ry="8" fill="${C.pink}"/>
    </g>
    <path d="M100 160 L100 196" stroke="${C.coal}" stroke-width="0"/>`,

  helmet: () => `
    <g ${ink}>
      <path d="M26 128 Q20 40 104 30 Q178 30 182 112 L182 140 Q182 156 166 158 L44 160 Q28 158 26 140Z" fill="${C.coal}"/>
      <path d="M104 64 Q166 64 172 108 L172 126 L104 126 Q92 126 92 112 L92 78 Q92 64 104 64Z" fill="${C.violet}"/>
    </g>
    <path d="M110 74 Q150 74 160 100" fill="none" stroke="${C.white}" stroke-width="6" stroke-linecap="round" opacity=".6"/>
    <path d="M40 72 L70 72 L54 100 L80 100 L44 146 L54 110 L30 110Z" fill="${C.acid}" ${ink}/>
    <path d="M26 136 L182 136" stroke="${C.acid}" stroke-width="6"/>
    <g ${ink}><rect x="58" y="166" width="96" height="22" rx="4" fill="${C.acid}"/></g>
    <text x="106" y="183" text-anchor="middle" ${font} font-size="15" fill="${C.coal}">RUTA 00</text>`,

  eye: () => `
    <g ${ink}>
      <path d="M6 100 Q100 16 194 100 Q100 184 6 100Z" fill="${C.white}"/>
      <circle cx="100" cy="100" r="44" fill="${C.violet}"/>
    </g>
    <circle cx="100" cy="100" r="20" fill="${C.coal}"/>
    <circle cx="114" cy="86" r="9" fill="${C.white}"/>
    <path d="M100 56 L100 66 M100 134 L100 144 M56 100 L66 100 M134 100 L144 100" stroke="${C.acid}" stroke-width="5" stroke-linecap="round"/>
    <path d="M30 70 L18 50 M60 48 L54 26 M100 40 L100 16 M140 48 L146 26 M170 70 L182 50" ${ink}/>`,

  bolt: () => `
    <g ${ink}><path d="M116 8 L36 112 L92 112 L74 192 L164 78 L108 78 L134 8Z" fill="${C.acid}"/></g>
    <path d="M110 30 L70 92" stroke="${C.white}" stroke-width="7" stroke-linecap="round" opacity=".7"/>`,

  smiley: () => `
    <g ${ink}><circle cx="100" cy="100" r="80" fill="${C.yellow}"/></g>
    <path d="M62 74 L84 92 M84 74 L62 92 M116 74 L138 92 M138 74 L116 92" stroke="${C.coal}" stroke-width="8" stroke-linecap="round"/>
    <path d="M56 118 Q100 168 144 118Z" fill="${C.coal}" ${ink}/>
    <path d="M90 140 Q100 162 116 146 Q110 136 90 140Z" fill="${C.pink}"/>
    <path d="M144 46 Q150 30 162 38 Q170 54 150 62Z" fill="${C.cyan}" ${ink}/>`,

  flame: () => `
    <g ${ink}>
      <path d="M100 8 Q128 50 152 70 Q182 106 166 148 Q148 190 100 192 Q52 190 34 148 Q20 108 52 84 Q50 112 68 120 Q60 70 100 8Z" fill="${C.orange}"/>
      <path d="M100 74 Q124 104 132 126 Q140 160 100 170 Q64 166 70 132 Q76 112 92 102 Q90 120 102 126 Q104 100 100 74Z" fill="${C.yellow}"/>
    </g>`,

  pixelCritter: () => {
    const map = [
      "...XX....XX...",
      "....X....X....",
      "...XXXXXXXX...",
      "..XXWWXXWWXX..",
      ".XXXWKXXWKXXX.",
      "XXXXXXXXXXXXXX",
      "XX.XXXXXXXX.XX",
      "XX.XMMMMMMX.XX",
      "...XX....XX...",
      "..XX......XX..",
    ];
    const colors = { X: C.acid, W: C.white, K: C.coal, M: C.pink };
    const s = 13;
    const ox = 100 - (map[0].length * s) / 2;
    const oy = 100 - (map.length * s) / 2;
    let cells = "";
    map.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch !== ".") cells += `<rect x="${ox + x * s}" y="${oy + y * s}" width="${s + 0.6}" height="${s + 0.6}" fill="${colors[ch]}"/>`;
      }),
    );
    return `<rect x="${ox - 8}" y="${oy - 8}" width="${map[0].length * s + 16}" height="${map.length * s + 16}" fill="${C.coal}" rx="6"/>${cells}`;
  },

  pixelHeart: () => {
    const map = [".XX...XX.", "XWXX.XXXX", "XWXXXXXXX", "XXXXXXXXX", ".XXXXXXX.", "..XXXXX..", "...XXX...", "....X...."];
    const s = 18;
    const ox = 100 - (9 * s) / 2;
    const oy = 100 - (8 * s) / 2;
    let cells = "";
    map.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch !== ".") cells += `<rect x="${ox + x * s}" y="${oy + y * s}" width="${s + 0.6}" height="${s + 0.6}" fill="${ch === "W" ? C.white : C.pink}"/>`;
      }),
    );
    return `<g transform="translate(0 0)"><rect x="${ox - 6}" y="${oy - 6}" width="${9 * s + 12}" height="${8 * s + 12}" fill="none"/>${cells}</g>`;
  },

  controller: () => `
    <g ${ink}>
      <path d="M44 62 L156 62 Q190 62 194 110 Q198 162 168 162 Q150 162 138 136 L62 136 Q50 162 32 162 Q2 162 6 110 Q10 62 44 62Z" fill="${C.violet}"/>
      <path d="M44 86 L56 86 L56 98 L68 98 L68 110 L56 110 L56 122 L44 122 L44 110 L32 110 L32 98 L44 98Z" fill="${C.coal}"/>
      <circle cx="148" cy="92" r="9" fill="${C.acid}"/><circle cx="166" cy="110" r="9" fill="${C.pink}"/><circle cx="130" cy="110" r="9" fill="${C.cyan}"/><circle cx="148" cy="128" r="9" fill="${C.yellow}"/>
    </g>
    <rect x="86" y="100" width="12" height="6" rx="3" fill="${C.cement}"/><rect x="104" y="100" width="12" height="6" rx="3" fill="${C.cement}"/>
    <text x="100" y="52" text-anchor="middle" ${font} font-size="22" fill="${C.coal}" stroke="${C.white}" stroke-width="0">GG</text>`,

  ufo: () => `
    <g ${ink}>
      <path d="M66 132 L40 196 L160 196 L134 132Z" fill="${C.acid}" opacity=".9"/>
      <path d="M62 82 Q62 40 100 40 Q138 40 138 82Z" fill="${C.cyan}"/>
      <ellipse cx="100" cy="100" rx="92" ry="30" fill="${C.violet}"/>
      <ellipse cx="100" cy="90" rx="52" ry="12" fill="${C.deep}"/>
    </g>
    <circle cx="44" cy="104" r="6" fill="${C.yellow}"/><circle cx="76" cy="114" r="6" fill="${C.acid}"/><circle cx="124" cy="114" r="6" fill="${C.acid}"/><circle cx="156" cy="104" r="6" fill="${C.yellow}"/>
    <path d="M84 56 Q92 48 100 48" stroke="${C.white}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <g ${ink}><rect x="86" y="160" width="28" height="24" rx="6" fill="${C.pink}"/></g>
    <circle cx="96" cy="170" r="3" fill="${C.coal}"/><circle cx="106" cy="170" r="3" fill="${C.coal}"/>`,

  robot: () => `
    <g ${ink}>
      <path d="M100 30 L100 12" fill="none"/><circle cx="100" cy="10" r="8" fill="${C.pink}"/>
      <rect x="34" y="30" width="132" height="110" rx="18" fill="${C.cement}"/>
      <rect x="16" y="66" width="18" height="40" rx="6" fill="${C.violet}"/><rect x="166" y="66" width="18" height="40" rx="6" fill="${C.violet}"/>
      <rect x="52" y="52" width="96" height="50" rx="10" fill="${C.coal}"/>
      <rect x="62" y="152" width="76" height="40" rx="8" fill="${C.violet}"/>
      <path d="M86 140 L86 152 M114 140 L114 152" fill="none"/>
    </g>
    <rect x="66" y="66" width="24" height="18" rx="3" fill="${C.acid}"/><rect x="110" y="66" width="24" height="18" rx="3" fill="${C.acid}"/>
    <path d="M70 118 L130 118" stroke="${C.coal}" stroke-width="6" stroke-dasharray="8 6"/>
    <circle cx="82" cy="172" r="6" fill="${C.acid}"/><circle cx="100" cy="172" r="6" fill="${C.yellow}"/><circle cx="118" cy="172" r="6" fill="${C.pink}"/>`,

  planet: () => `
    <g ${ink}>
      <path d="M14 128 Q4 104 100 82 Q196 60 190 84" fill="none"/>
      <circle cx="100" cy="100" r="62" fill="${C.violet}"/>
    </g>
    <path d="M52 76 Q100 92 150 70 M42 112 Q100 128 158 106" stroke="${C.deep}" stroke-width="10" fill="none" stroke-linecap="round"/>
    <circle cx="80" cy="132" r="10" fill="${C.deep}"/><circle cx="128" cy="58" r="7" fill="${C.deep}"/>
    <g ${ink}><path d="M8 118 Q-4 146 100 120 Q204 94 192 70 Q186 60 166 62 L164 72 Q178 72 176 80 Q170 94 100 110 Q30 126 22 116 Q20 110 32 104 L30 94 Q10 102 8 118Z" fill="${C.acid}"/></g>
    ${star4(30, 40, 14, C.yellow)}${star4(170, 160, 12)}${star4(40, 170, 8, C.white)}`,

  scarf: () => `
    <g ${ink}>
      <path d="M10 70 L190 40 L190 100 L10 130Z" fill="${C.white}"/>
    </g>
    <path d="M40 65 L40 125 M70 60 L70 120 M130 50 L130 110 M160 45 L160 105" stroke="${C.violet}" stroke-width="18"/>
    <path d="M10 70 L190 40 L190 100 L10 130Z" fill="none" ${ink}/>
    <text x="100" y="98" text-anchor="middle" ${font} font-size="30" fill="${C.coal}" transform="rotate(-9 100 88)">VAMOS</text>
    <path d="M14 132 L10 158 M24 130 L22 158 M34 128 L34 156 M170 102 L172 128 M180 100 L184 126 M188 100 L194 124" stroke="${C.violet}" stroke-width="6" stroke-linecap="round"/>`,

  jersey: () => `
    <g ${ink}>
      <path d="M62 22 Q100 40 138 22 L190 50 L172 94 L150 84 L150 186 L50 186 L50 84 L28 94 L10 50Z" fill="${C.acid}"/>
    </g>
    <path d="M78 26 L78 186 M100 32 L100 186 M122 26 L122 186" stroke="${C.coal}" stroke-width="10" opacity=".9"/>
    <path d="M62 22 Q100 40 138 22 L190 50 L172 94 L150 84 L150 186 L50 186 L50 84 L28 94 L10 50Z" fill="none" ${ink}/>
    <path d="M80 26 Q100 50 120 26" fill="${C.violet}" ${ink}/>
    <rect x="66" y="88" width="68" height="62" rx="8" fill="${C.white}" ${ink}/>
    <text x="100" y="140" text-anchor="middle" ${font} font-size="48" fill="${C.violet}">10</text>`,

  trophyHands: () => `
    <g ${ink}>
      <path d="M58 26 L142 26 L138 86 Q132 118 100 120 Q68 118 62 86Z" fill="${C.yellow}"/>
      <path d="M60 40 Q24 40 30 70 Q36 92 64 94 M140 40 Q176 40 170 70 Q164 92 136 94" fill="none"/>
      <rect x="84" y="120" width="32" height="26" fill="${C.yellow}"/>
      <rect x="56" y="146" width="88" height="38" rx="4" fill="${C.coal}"/>
    </g>
    <path d="M80 40 L76 86" stroke="${C.white}" stroke-width="7" stroke-linecap="round" opacity=".7"/>
    <text x="100" y="172" text-anchor="middle" ${font} font-size="16" fill="${C.acid}">CAMPEÓN</text>`,

  onigiri: () => `
    <g ${ink}>
      <path d="M100 20 Q118 20 150 80 Q182 140 168 162 Q156 180 100 180 Q44 180 32 162 Q18 140 50 80 Q82 20 100 20Z" fill="${C.white}"/>
      <rect x="62" y="128" width="76" height="52" fill="${C.coal}"/>
    </g>
    <ellipse cx="78" cy="100" rx="7" ry="9" fill="${C.coal}"/><ellipse cx="122" cy="100" rx="7" ry="9" fill="${C.coal}"/>
    <circle cx="80" cy="96" r="2.5" fill="${C.white}"/><circle cx="124" cy="96" r="2.5" fill="${C.white}"/>
    <path d="M92 112 Q100 120 108 112" stroke="${C.coal}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <ellipse cx="64" cy="116" rx="9" ry="5" fill="${C.pink}"/><ellipse cx="136" cy="116" rx="9" ry="5" fill="${C.pink}"/>
    <path d="M84 150 L116 150" stroke="${C.acid}" stroke-width="5" stroke-linecap="round"/>`,

  comet: () => `
    <g ${ink}>
      <path d="M118 74 L10 150 L28 168 Z" fill="${C.violet}"/>
      <path d="M130 82 L40 190 L66 196Z" fill="${C.pink}"/>
      <path d="M140 18 L156 58 L198 60 L166 86 L178 128 L140 104 L102 128 L114 86 L82 60 L124 58Z" fill="${C.yellow}"/>
    </g>
    <ellipse cx="130" cy="74" rx="4" ry="6" fill="${C.coal}"/><ellipse cx="150" cy="74" rx="4" ry="6" fill="${C.coal}"/>
    <path d="M132 90 Q140 98 148 90" stroke="${C.coal}" stroke-width="4" fill="none" stroke-linecap="round"/>`,

  record: () => `
    <g ${ink}><circle cx="100" cy="100" r="86" fill="${C.coal}"/></g>
    <circle cx="100" cy="100" r="70" fill="none" stroke="${C.dark}" stroke-width="3"/><circle cx="100" cy="100" r="58" fill="none" stroke="${C.dark}" stroke-width="3"/><circle cx="100" cy="100" r="46" fill="none" stroke="${C.dark}" stroke-width="3"/>
    <circle cx="100" cy="100" r="30" fill="${C.acid}"/><circle cx="100" cy="100" r="5" fill="${C.coal}"/>
    <text x="100" y="94" text-anchor="middle" ${font} font-size="9" fill="${C.coal}">SUBLIME</text>
    <path d="M44 62 Q60 40 90 32" stroke="${C.white}" stroke-width="6" fill="none" stroke-linecap="round" opacity=".5"/>`,

  rocket: () => `
    <g ${ink}>
      <path d="M100 8 Q146 44 140 130 L60 130 Q54 44 100 8Z" fill="${C.cement}"/>
      <path d="M60 104 L28 150 L64 138Z M140 104 L172 150 L136 138Z" fill="${C.violet}"/>
      <path d="M70 130 L130 130 L120 150 L80 150Z" fill="${C.coal}"/>
      <path d="M82 150 Q100 200 118 150Z" fill="${C.orange}"/>
      <circle cx="100" cy="70" r="18" fill="${C.cyan}"/>
    </g>
    <path d="M90 150 Q100 180 110 150Z" fill="${C.yellow}"/>`,

  wordBadge: (word, bg = C.acid, fg = C.coal, rot = -6) => {
    const size = word.length > 6 ? 30 : 40;
    return `
    <g transform="rotate(${rot} 100 100)">
      <g ${ink}><path d="M12 62 L188 54 L192 142 L8 148Z" fill="${bg}"/></g>
      <text x="100" y="${112 + size * 0.12}" text-anchor="middle" ${font} font-size="${size}" fill="${fg}" letter-spacing="-1">${word}</text>
    </g>`;
  },

  starBadge: (line1, line2, bg = C.violet, fg = C.white) => {
    let d = "";
    for (let i = 0; i < 24; i++) {
      const a = (Math.PI * 2 * i) / 24 - Math.PI / 2;
      const r = i % 2 ? 74 : 92;
      d += `${i ? "L" : "M"}${(100 + Math.cos(a) * r).toFixed(1)} ${(100 + Math.sin(a) * r).toFixed(1)} `;
    }
    return `<g ${ink}><path d="${d}Z" fill="${bg}"/></g>
      <text x="100" y="98" text-anchor="middle" ${font} font-size="24" fill="${fg}">${line1}</text>
      <text x="100" y="124" text-anchor="middle" ${font} font-size="20" fill="${C.acid}">${line2}</text>`;
  },

  hand: () => `
    <g ${ink}>
      <path d="M62 190 L56 112 Q40 92 46 78 Q58 70 70 92 L72 40 Q72 26 84 26 Q96 26 96 40 L96 30 Q96 16 108 16 Q120 16 120 30 L120 42 Q122 30 134 30 Q146 32 144 46 L144 60 Q146 50 158 52 Q168 56 166 70 L160 130 Q156 160 140 190Z" fill="${C.violet}"/>
      <path d="M96 40 L96 96 M120 42 L120 96 M144 60 L144 100" fill="none"/>
    </g>
    <path d="M70 150 L138 150" stroke="${C.acid}" stroke-width="10"/>`,
};
