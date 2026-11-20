/**
 * Design upload rules the admin's browser can check as soon as a file is picked.
 * The server checks everything again (src/server/designs/files.ts).
 */
export const DESIGN_MAX_BYTES = 15 * 1024 * 1024;
export const DESIGN_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".psd"] as const;

/** What the server answers when it checks a picked file without saving it. */
export type DesignFileCheck =
  | { ok: true; width: number; height: number; warning: string | null }
  | { ok: false; error: string };

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
};

/** A message for the admin when the file cannot be a design, before uploading it; null when it may be. */
export function precheckDesignFile(file: { name: string; size: number }): string | null {
  if (!(DESIGN_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))) {
    return "Formato no admitido: subí un PNG, JPG, WebP o PSD.";
  }
  if (!file.size) return "El archivo está vacío.";
  if (file.size > DESIGN_MAX_BYTES) return "El archivo supera los 15 MB.";
  return null;
}

/** "2,4 MB" / "830 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString("es-AR", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
