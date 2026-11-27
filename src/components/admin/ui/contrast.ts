/**
 * WCAG 2.x contrast helpers. The tests use them to check every text/background
 * token pair of tokens.module.css, so the stylesheet stays the only source of
 * the values.
 */

function channels(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`Expected a hex color, got "${hex}".`);
  const digits = match[1].length === 3 ? [...match[1]].map((d) => d + d).join("") : match[1];
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as [number, number, number];
}

/** Relative luminance (0 = black, 1 = white) of a #rgb or #rrggbb color. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** The `--sa-*` custom properties declared in a stylesheet (last one wins). */
export function parseCustomProperties(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const match of css.matchAll(/(--sa-[\w-]+)\s*:\s*([^;]+);/g)) tokens[match[1]] = match[2].trim();
  return tokens;
}
