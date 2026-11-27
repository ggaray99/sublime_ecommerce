import type { QueryFn } from "../db/client.ts";
import { runBulkAsAdmin } from "../api/handler.ts";
import type { Admin } from "./repository.ts";
import { parsePesos } from "./validation.ts";
import { formatCsv, pesosCell } from "../../lib/csv.ts";

/**
 * Catalog spreadsheet: one row per SKU (each variant has its own). Export and
 * import use the same columns, so a downloaded file can be edited in Excel or
 * Google Sheets and uploaded back. Import reuses the admin API bulk routes
 * (same validation and results) plus cost, weight and dimensions.
 */
export const CSV_COLUMNS = [
  "sku",
  "producto",
  "nombre",
  "opciones",
  "categoria",
  "tema",
  "estado",
  "precio",
  "costo",
  "stock",
  "peso_g",
  "largo_cm",
  "ancho_cm",
  "alto_cm",
] as const;

type Column = (typeof CSV_COLUMNS)[number];
export type CsvRow = Partial<Record<Column, string>>;

const STATUS_OUT: Record<string, string> = { draft: "borrador", active: "activo", archived: "archivado" };
const STATUS_IN: Record<string, string> = { borrador: "draft", activo: "active", archivado: "archived", draft: "draft", active: "active", archived: "archived" };

export const MAX_IMPORT_ROWS = 500;

const cm = (mm: number | null) => (mm === null ? "" : String(mm / 10).replace(".", ","));

// ------------------------------------------------------------------ format

/** Excel in Argentina opens ";" files in columns; a BOM keeps the accents (src/lib/csv.ts). */
export function toCsv(rows: CsvRow[]): string {
  return formatCsv(
    CSV_COLUMNS,
    rows.map((row) => CSV_COLUMNS.map((column) => row[column] ?? "")),
  );
}

/** Parses ";" or "," separated text (whichever the header uses), with quoted cells. */
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.slice(0, clean.search(/\r?\n|$/));
  const separator = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      record.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[i + 1] === "\n") i++;
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
    } else cell += char;
  }
  if (cell || record.length) records.push([...record, cell]);
  const nonEmpty = records.filter((row) => row.some((value) => value.trim()));
  const [header = [], ...rows] = nonEmpty;
  return { header: header.map((name) => name.trim().toLowerCase()), rows };
}

// ------------------------------------------------------------------ export

type ExportRow = {
  sku: string;
  legacy_id: string;
  name: string;
  options: Record<string, string>;
  option_names: string[];
  category_id: string;
  theme: string;
  status: string;
  price_minor: string | number | null;
  cost_minor: string | number | null;
  track_stock: boolean;
  on_hand: number | null;
  weight_g: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
};

/** The whole catalog, or only the given products (legacy ids; unknown ones are skipped). */
export async function exportCatalog(sql: QueryFn, filter: { productIds?: string[] } = {}): Promise<CsvRow[]> {
  const selected = filter.productIds !== undefined;
  const rows = (await sql.query(
    `SELECT v.sku, p.legacy_id, p.name, v.options, p.option_names, p.category_id, p.theme, p.status, v.price_minor, v.cost_minor,
            v.track_stock, i.on_hand, p.weight_g, p.length_mm, p.width_mm, p.height_mm
     FROM products p
     JOIN product_variants v ON v.product_id = p.id AND (v.is_default OR p.option_names <> '{}') AND v.active
     LEFT JOIN inventory i ON i.variant_id = v.id
     -- Products with options list their variants, not the hidden default row.
     WHERE NOT (p.option_names <> '{}' AND v.is_default AND v.options = '{}'::jsonb)${selected ? " AND p.legacy_id = ANY ($1::text[])" : ""}
     ORDER BY p.sort_order, p.name, v.sort_order, v.sku`,
    selected ? [filter.productIds] : undefined,
  )) as ExportRow[];
  const num = (value: string | number | null) => (value === null ? null : Number(value));
  return rows.map((row) => ({
    sku: row.sku,
    producto: row.legacy_id,
    nombre: row.name,
    opciones: row.option_names.map((name) => `${name}: ${row.options[name] ?? ""}`).join(" / "),
    categoria: row.category_id,
    tema: row.theme,
    estado: STATUS_OUT[row.status] ?? row.status,
    precio: pesosCell(num(row.price_minor)),
    costo: pesosCell(num(row.cost_minor)),
    stock: row.track_stock ? String(row.on_hand ?? 0) : "a pedido",
    peso_g: row.weight_g === null ? "" : String(row.weight_g),
    largo_cm: cm(row.length_mm),
    ancho_cm: cm(row.width_mm),
    alto_cm: cm(row.height_mm),
  }));
}

// ------------------------------------------------------------------ import

export type ImportLine = { row: number; sku: string; result: "created" | "updated" | "unchanged" | "failed"; detail: string };
export type ImportReport = { dryRun: boolean; lines: ImportLine[]; summary: Record<ImportLine["result"], number> };

const FIELD_LABEL: Record<string, string> = {
  name: "nombre",
  categoryId: "categoría",
  theme: "tema",
  status: "estado",
  priceMinor: "precio",
  onHand: "stock",
  cost: "costo",
  logistics: "peso/medidas",
};

/** First message of an API error body, in the panel's words. */
function apiMessage(body: unknown): string {
  const error = body as { message?: string; fields?: { path: string; message: string }[] } | undefined;
  const field = error?.fields?.[0];
  return field ? `${field.path.replace(/^items\[\d+\]\./, "")}: ${field.message}` : (error?.message ?? "Error");
}

type BulkItem = { index: number; result: string; changes?: string[]; error?: unknown };
const bulkItems = (response: { status: number; body: unknown }): BulkItem[] | null =>
  response.status === 200 ? ((response.body as { items: BulkItem[] }).items ?? []) : null;

/**
 * Applies (or, with dryRun, only checks) a catalog CSV. Each row is independent:
 * a bad row is reported and the others still go through. Empty cells mean "do
 * not change". New SKUs are created as drafts unless "estado" says otherwise.
 */
export async function importCatalog(sql: QueryFn, actor: Admin, text: string, dryRun: boolean): Promise<ImportReport | { error: string }> {
  const { header, rows } = parseCsv(text);
  if (!header.includes("sku")) return { error: "Falta la columna sku en la primera fila. Descargá la planilla actual para ver el formato." };
  if (!rows.length) return { error: "La planilla no tiene filas." };
  if (rows.length > MAX_IMPORT_ROWS) return { error: `Hasta ${MAX_IMPORT_ROWS} filas por archivo.` };
  const unknown = header.filter((name) => name && !(CSV_COLUMNS as readonly string[]).includes(name));
  if (unknown.length) return { error: `Columnas que no conocemos: ${unknown.join(", ")}.` };

  const records: (CsvRow & { row: number })[] = rows.map((cells, index) => ({
    row: index + 2,
    ...(Object.fromEntries(header.map((name, column) => [name, (cells[column] ?? "").trim()])) as CsvRow),
  }));

  const existing = new Map(
    (
      (await sql.query("SELECT v.sku, v.is_default, p.option_names <> '{}' AS has_options, p.name, p.category_id, p.theme, p.status FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.sku = ANY ($1)", [
        records.map((record) => (record.sku ?? "").toUpperCase()),
      ])) as { sku: string; is_default: boolean; has_options: boolean; name: string; category_id: string; theme: string; status: string }[]
    ).map((row) => [row.sku, row]),
  );

  const lines = new Map<number, { sku: string; failed: string[]; changed: string[]; created: boolean }>();
  const note = (record: { row: number; sku?: string }) => {
    const line = lines.get(record.row) ?? { sku: (record.sku ?? "").toUpperCase(), failed: [], changed: [], created: false };
    lines.set(record.row, line);
    return line;
  };

  // 1. Product data: new SKUs, and name/category/status of single products.
  const productItems: { record: (typeof records)[number]; item: Record<string, unknown> }[] = [];
  for (const record of records) {
    const line = note(record);
    if (!line.sku) {
      line.failed.push("falta el sku");
      continue;
    }
    const current = existing.get(line.sku);
    const status = record.estado ? STATUS_IN[record.estado.toLowerCase()] : undefined;
    if (record.estado && !status) line.failed.push("estado: borrador, activo o archivado");
    const item: Record<string, unknown> = { sku: line.sku };
    if (!current) {
      // A new product needs a theme for the store filters: "gráfico" unless the sheet says otherwise.
      Object.assign(item, {
        name: record.nombre ?? "",
        categoryId: record.categoria ?? "",
        theme: record.tema || "grafico",
        status: status ?? "draft",
        initialStock: Number(record.stock || 0),
      });
      const price = record.precio ? parsePesos(record.precio) : null;
      if (price) item.priceMinor = price;
      else item.requiresQuote = true;
      productItems.push({ record, item });
    } else if (current.is_default && !current.has_options) {
      if (record.nombre) item.name = record.nombre;
      if (record.categoria) item.categoryId = record.categoria;
      if (record.tema) item.theme = record.tema;
      if (status) item.status = status;
      if (Object.keys(item).length > 1) productItems.push({ record, item });
    } else if (
      // The export repeats the product's content on every variant row: only a different value is a change.
      (record.nombre && record.nombre.trim() !== current.name) ||
      (record.categoria && record.categoria.trim() !== current.category_id) ||
      (record.tema && record.tema.trim() !== current.theme) ||
      (status && status !== current.status)
    ) {
      line.failed.push("nombre, categoría, tema y estado de un producto con variantes se cambian en su ficha");
    }
  }
  if (productItems.length) {
    const response = await runBulkAsAdmin("products/bulk-upsert", { dryRun, items: productItems.map((entry) => entry.item) }, actor, sql);
    const items = bulkItems(response);
    productItems.forEach(({ record }, index) => {
      const line = note(record);
      const outcome = items?.[index];
      if (!outcome) line.failed.push(apiMessage(response.body));
      else if (outcome.result === "failed") line.failed.push(apiMessage(outcome.error));
      else if (outcome.result === "created") line.created = true;
      else if (outcome.result === "updated") line.changed.push(...(outcome.changes ?? []).map((change) => FIELD_LABEL[change] ?? change));
    });
  }

  // 2. Prices and stock of existing SKUs (new ones got theirs when created).
  const known = records.filter((record) => existing.has((record.sku ?? "").toUpperCase()));
  for (const record of known) if (record.precio && parsePesos(record.precio) === null) note(record).failed.push("precio: un monto en pesos, por ejemplo 8.900");
  const priceItems = known.filter((record) => record.precio && parsePesos(record.precio) !== null);
  const stockItems = known.filter((record) => record.stock && record.stock !== "a pedido");
  for (const [route, list, toItem] of [
    ["prices/bulk-update", priceItems, (record: CsvRow) => ({ sku: record.sku!.toUpperCase(), priceMinor: parsePesos(record.precio!) ?? -1 })],
    ["stock/bulk-count", stockItems, (record: CsvRow) => ({ sku: record.sku!.toUpperCase(), onHand: record.stock, reason: "adjustment", note: "Importación de planilla" })],
  ] as const) {
    if (!list.length) continue;
    const response = await runBulkAsAdmin(route, { dryRun, items: list.map((record) => toItem(record)) }, actor, sql);
    const items = bulkItems(response);
    list.forEach((record, index) => {
      const line = note(record);
      const outcome = items?.[index];
      if (!outcome) line.failed.push(apiMessage(response.body));
      else if (outcome.result === "failed") line.failed.push(route === "prices/bulk-update" ? `precio: ${apiMessage(outcome.error)}` : apiMessage(outcome.error));
      else if (outcome.result === "updated") line.changed.push(route === "prices/bulk-update" ? "precio" : "stock");
    });
  }

  // 3. Cost (per SKU) and weight/dimensions (per product), not part of the API.
  // Rows are validated here and written together below, in one statement.
  const writes: { sku: string; cost: number | null; weight: number | null; length: number | null; width: number | null; height: number | null; changes: string }[] = [];
  for (const record of records) {
    const line = note(record);
    if (!line.sku || (!existing.has(line.sku) && !line.created)) continue;
    const cost = record.costo ? parsePesos(record.costo) : undefined;
    if (record.costo && cost === null) line.failed.push("costo: un monto en pesos");
    const int = (raw: string | undefined, max: number, factor = 1) => {
      if (!raw) return undefined;
      const value = Math.round(Number(raw.replace(",", ".")) * factor);
      return Number.isFinite(value) && value >= 1 && value <= max ? value : null;
    };
    const logistics = {
      weight_g: int(record.peso_g, 100000),
      length_mm: int(record.largo_cm, 3000, 10),
      width_mm: int(record.ancho_cm, 3000, 10),
      height_mm: int(record.alto_cm, 3000, 10),
    };
    if (Object.values(logistics).includes(null)) line.failed.push("peso en gramos y medidas en cm, mayores a 0");
    const setLogistics = Object.entries(logistics).filter(([, value]) => typeof value === "number") as [string, number][];
    if (dryRun || (cost === undefined && !setLogistics.length) || line.failed.length) {
      if (cost !== undefined && cost !== null && dryRun) line.changed.push("costo");
      if (setLogistics.length && dryRun) line.changed.push("peso/medidas");
      continue;
    }
    writes.push({
      sku: line.sku,
      cost: cost ?? null,
      weight: logistics.weight_g ?? null,
      length: logistics.length_mm ?? null,
      width: logistics.width_mm ?? null,
      height: logistics.height_mm ?? null,
      changes: JSON.stringify({ sku: line.sku, costMinor: cost ?? undefined, ...Object.fromEntries(setLogistics) }),
    });
  }
  if (writes.length) {
    const column = <K extends keyof (typeof writes)[number]>(key: K) => writes.map((write) => write[key]);
    const changed = (await sql.query(
      `WITH input AS (
         SELECT * FROM unnest($1::text[], $2::bigint[], $3::int[], $4::int[], $5::int[], $6::int[], $7::jsonb[])
           AS t(sku, cost, weight, length, width, height, changes)
       ),
       target AS (SELECT input.*, v.id AS variant_id, v.product_id FROM input JOIN product_variants v ON v.sku = input.sku),
       cost AS (
         UPDATE product_variants v SET cost_minor = t.cost, updated_at = now() FROM target t
         WHERE v.id = t.variant_id AND t.cost IS NOT NULL AND v.cost_minor IS DISTINCT FROM t.cost
         RETURNING t.sku
       ),
       logistics AS (
         UPDATE products p SET weight_g = coalesce(t.weight, p.weight_g), length_mm = coalesce(t.length, p.length_mm),
                width_mm = coalesce(t.width, p.width_mm), height_mm = coalesce(t.height, p.height_mm), updated_at = now()
         FROM target t
         WHERE p.id = t.product_id
           AND (p.weight_g IS DISTINCT FROM coalesce(t.weight, p.weight_g) OR p.length_mm IS DISTINCT FROM coalesce(t.length, p.length_mm)
                OR p.width_mm IS DISTINCT FROM coalesce(t.width, p.width_mm) OR p.height_mm IS DISTINCT FROM coalesce(t.height, p.height_mm))
         RETURNING t.sku
       ),
       logged AS (
         INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
         SELECT $8, $9, 'product.import', 'product', p.legacy_id, t.changes
         FROM target t JOIN products p ON p.id = t.product_id
         WHERE t.sku IN (SELECT sku FROM cost UNION SELECT sku FROM logistics)
       )
       SELECT 'cost' AS kind, sku FROM cost UNION ALL SELECT 'logistics', sku FROM logistics`,
      [column("sku"), column("cost"), column("weight"), column("length"), column("width"), column("height"), column("changes"), actor.authUserId, actor.email],
    )) as { kind: "cost" | "logistics"; sku: string }[];
    const bySku = new Map([...lines.values()].map((line) => [line.sku, line]));
    for (const row of changed) bySku.get(row.sku)?.changed.push(row.kind === "cost" ? "costo" : "peso/medidas");
  }

  const report: ImportLine[] = [...lines.entries()]
    .sort(([a], [b]) => a - b)
    .map(([row, line]) => {
      if (line.failed.length) return { row, sku: line.sku, result: "failed", detail: line.failed.join(" · ") };
      if (line.created) return { row, sku: line.sku, result: "created", detail: "Producto nuevo (borrador si no indicás estado)" };
      if (line.changed.length) return { row, sku: line.sku, result: "updated", detail: [...new Set(line.changed)].join(", ") };
      return { row, sku: line.sku, result: "unchanged", detail: "Sin cambios" };
    });
  const summary = { created: 0, updated: 0, unchanged: 0, failed: 0 };
  for (const line of report) summary[line.result] += 1;
  return { dryRun, lines: report, summary };
}
