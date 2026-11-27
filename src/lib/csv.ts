/**
 * The panel's spreadsheet format: ";" separated (Excel in Argentina opens it
 * in columns), CRLF line ends and a UTF-8 BOM so accents survive. The catalog
 * file (src/server/admin/csv.ts) and the selection exports share it.
 */
export const CSV_SEPARATOR = ";";
const BOM = "﻿";

/** Cells a spreadsheet would run as a formula (OWASP "CSV injection"). */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One cell, quoted when it holds a separator, quote or line break. With
 * `neutralizeFormulas`, text that a spreadsheet would evaluate gets a leading
 * apostrophe. The catalog file leaves it off: it must re-import unchanged.
 */
export function csvCell(value = "", options: { neutralizeFormulas?: boolean } = {}): string {
  const text = options.neutralizeFormulas && FORMULA_START.test(value) ? `'${value}` : value;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Header plus rows as a complete file (BOM, CRLF, trailing line end). */
export function formatCsv(header: readonly string[], rows: readonly (readonly string[])[], options: { neutralizeFormulas?: boolean } = {}): string {
  const line = (cells: readonly string[]) => cells.map((value) => csvCell(value, options)).join(CSV_SEPARATOR);
  return `${BOM}${[header.join(CSV_SEPARATOR), ...rows.map(line)].join("\r\n")}\r\n`;
}

/** Pesos from cents: 8900, 1500,50 (no thousands separator); empty when unknown. */
export const pesosCell = (minor: number | null) =>
  minor === null ? "" : minor % 100 ? `${Math.floor(minor / 100)},${String(minor % 100).padStart(2, "0")}` : String(minor / 100);
