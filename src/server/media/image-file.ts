/**
 * Image upload validation. The type comes from the file's own bytes (magic
 * numbers), never from its name or the browser's Content-Type, and the
 * dimensions are read from the image header without decoding it.
 */

export type ImageType = "image/jpeg" | "image/png" | "image/webp";
export type ImageInfo = { type: ImageType; width: number; height: number; size: number; extension: "jpg" | "png" | "webp" };

/** Vercel Functions accept request bodies up to 4.5 MB; keep room for the form overhead. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MIN_IMAGE_SIDE = 400;
export const MAX_IMAGE_SIDE = 4000;

export class ImageFileError extends Error {}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));
const be16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const le24 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

function pngSize(b: Uint8Array) {
  if (b.length < 24 || ascii(b, 12, 4) !== "IHDR") return null;
  return { width: be32(b, 16), height: be32(b, 20) };
}

/** Walks JPEG segments until a start-of-frame marker, which holds the size. */
function jpegSize(b: Uint8Array) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return { height: be16(b, i + 5), width: be16(b, i + 7) };
    i += 2 + be16(b, i + 2);
  }
  return null;
}

function webpSize(b: Uint8Array) {
  if (b.length < 30) return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") return { width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff };
  if (chunk === "VP8L") {
    return { width: 1 + (b[21] | ((b[22] & 0x3f) << 8)), height: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)) };
  }
  if (chunk === "VP8X") return { width: 1 + le24(b, 24), height: 1 + le24(b, 27) };
  return null;
}

function detect(b: Uint8Array): { type: ImageType; extension: ImageInfo["extension"]; size: { width: number; height: number } | null } | null {
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a) {
    return { type: "image/png", extension: "png", size: pngSize(b) };
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", extension: "jpg", size: jpegSize(b) };
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return { type: "image/webp", extension: "webp", size: webpSize(b) };
  return null;
}

/** Validates an uploaded image; throws ImageFileError with a message for people. */
export function inspectImage(bytes: Uint8Array): ImageInfo {
  if (!bytes.length) throw new ImageFileError("Elegí una imagen.");
  if (bytes.length > MAX_IMAGE_BYTES) throw new ImageFileError("La imagen supera 4 MB. Exportala más liviana (por ejemplo, WebP o JPG).");
  const found = detect(bytes);
  if (!found) throw new ImageFileError("Formato no admitido: subí una imagen JPG, PNG o WebP.");
  if (!found.size) throw new ImageFileError("No pudimos leer las medidas de la imagen. Probá exportarla de nuevo.");
  const { width, height } = found.size;
  if (Math.min(width, height) < MIN_IMAGE_SIDE || Math.max(width, height) > MAX_IMAGE_SIDE) {
    throw new ImageFileError(`La imagen mide ${width}×${height} px: cada lado debe estar entre ${MIN_IMAGE_SIDE} y ${MAX_IMAGE_SIDE} px.`);
  }
  return { type: found.type, extension: found.extension, width, height, size: bytes.length };
}
