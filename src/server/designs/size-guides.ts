import { isMockupKind, type MockupKind } from "../../lib/designs/kinds.ts";
import { AdminDataError, type Admin } from "../admin/repository.ts";
import type { QueryFn } from "../customers/repository.ts";

/** A size-guide table as the store shows it: column headers, rows of cells (one per header) and a note. */
export type SizeGuideTable = { headers: string[]; rows: string[][]; note: string };

/** A stored guide of one base product kind (Admin › Soportes). */
export type SizeGuide = SizeGuideTable & { kind: MockupKind; updatedAt: Date };

/** Same limits as the size_guides CHECK constraints (0025_size_guides.sql). */
export const SIZE_GUIDE_LIMITS = { columns: 8, rows: 30, cell: 40, note: 300 } as const;

/** What the editor starts with when a kind has no guide yet. */
export const EXAMPLE_SIZE_GUIDE_HEADERS = ["Talle", "Ancho (cm)", "Largo (cm)"];

const UNREADABLE = "No pudimos leer la tabla. Recargá la página y probá de nuevo.";

const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((cell) => typeof cell === "string");

/** Checks and normalizes a guide: trims every cell, drops fully empty rows and enforces the limits. */
export function validateSizeGuide(input: { headers: unknown; rows: unknown; note: unknown }): { guide: SizeGuideTable } | { error: string } {
  const { headers, rows, note } = input;
  if (!isStringList(headers) || !Array.isArray(rows) || !rows.every(isStringList) || typeof note !== "string") return { error: UNREADABLE };
  const cleanHeaders = headers.map((header) => header.trim());
  if (!cleanHeaders.length) return { error: "La tabla necesita al menos una columna." };
  if (rows.some((row) => row.length !== cleanHeaders.length)) return { error: "Cada fila debe tener una celda por columna." };
  const cleanRows = rows.map((row) => row.map((cell) => cell.trim())).filter((row) => row.some(Boolean));
  if (cleanHeaders.length > SIZE_GUIDE_LIMITS.columns || cleanRows.length > SIZE_GUIDE_LIMITS.rows) return { error: "Máximo 8 columnas y 30 filas." };
  if (cleanHeaders.some((header) => !header)) return { error: "Cada columna necesita un título." };
  if (!cleanRows.length) return { error: "Agregá al menos una fila con datos." };
  if ([...cleanHeaders, ...cleanRows.flat()].some((cell) => cell.length > SIZE_GUIDE_LIMITS.cell)) {
    return { error: `Cada celda admite hasta ${SIZE_GUIDE_LIMITS.cell} caracteres.` };
  }
  const cleanNote = note.trim();
  if (cleanNote.length > SIZE_GUIDE_LIMITS.note) return { error: `La nota admite hasta ${SIZE_GUIDE_LIMITS.note} caracteres.` };
  return { guide: { headers: cleanHeaders, rows: cleanRows, note: cleanNote } };
}

/** The editor's posted form: the table as JSON ({ headers, rows }) and the note. */
export function parseSizeGuide(values: { table?: string; note?: string }): { guide: SizeGuideTable } | { error: string } {
  let table: unknown;
  try {
    table = JSON.parse(values.table ?? "");
  } catch {
    return { error: UNREADABLE };
  }
  if (!table || typeof table !== "object") return { error: UNREADABLE };
  const { headers, rows } = table as Record<string, unknown>;
  return validateSizeGuide({ headers, rows, note: values.note ?? "" });
}

/** Guides by kind, as the store design page reads them. */
export const storeSizeGuides = (guides: SizeGuide[]): Partial<Record<MockupKind, SizeGuideTable>> =>
  Object.fromEntries(guides.map(({ kind, headers, rows, note }) => [kind, { headers, rows, note }]));

type Row = { kind: MockupKind; headers: string[]; rows: string[][]; note: string; updated_at: Date };

const fromRow = (row: Row): SizeGuide => ({ kind: row.kind, headers: row.headers, rows: row.rows, note: row.note, updatedAt: row.updated_at });

const COLUMNS = `kind, headers, rows, note, updated_at`;

const UNKNOWN_KIND = "Ese tipo de soporte no existe.";

const logGuide = (action: string, first: number) =>
  `INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
   SELECT $${first}, $${first + 1}, '${action}', 'design', 'size-guide-' || kind, $${first + 2}::jsonb`;

/** Audit entity id of a kind's guide, for the Soportes history. */
export const sizeGuideAuditId = (kind: MockupKind) => `size-guide-${kind}`;

/** Size-guide tables per base product kind. */
export function createSizeGuideRepository(sql: QueryFn) {
  async function getSizeGuide(kind: string): Promise<SizeGuide | null> {
    if (!isMockupKind(kind)) return null;
    const rows = (await sql.query(`SELECT ${COLUMNS} FROM size_guides WHERE kind = $1`, [kind])) as Row[];
    return rows[0] ? fromRow(rows[0]) : null;
  }

  return {
    getSizeGuide,

    async listSizeGuides(): Promise<SizeGuide[]> {
      return ((await sql.query(`SELECT ${COLUMNS} FROM size_guides ORDER BY kind`)) as Row[]).filter((row) => isMockupKind(row.kind)).map(fromRow);
    },

    /** Creates or replaces the kind's guide, with its audit row in the same statement. */
    async saveSizeGuide(actor: Admin, kind: string, input: SizeGuideTable): Promise<SizeGuideTable> {
      if (!isMockupKind(kind)) throw new AdminDataError("not_found", UNKNOWN_KIND);
      const result = validateSizeGuide(input);
      if ("error" in result) throw new AdminDataError("conflict", result.error);
      const { headers, rows, note } = result.guide;
      await sql.query(
        `WITH saved AS (
           INSERT INTO size_guides (kind, headers, rows, note) VALUES ($1, $2, $3::jsonb, $4)
           ON CONFLICT (kind) DO UPDATE SET headers = excluded.headers, rows = excluded.rows, note = excluded.note, updated_at = now()
           RETURNING kind
         )
         ${logGuide("design.size_guide", 5)} FROM saved`,
        [kind, headers, JSON.stringify(rows), note, actor.authUserId, actor.email, JSON.stringify(result.guide)],
      );
      return result.guide;
    },

    /** Removes the kind's guide: the store stops showing it. */
    async deleteSizeGuide(actor: Admin, kind: string): Promise<void> {
      if (!isMockupKind(kind)) throw new AdminDataError("not_found", UNKNOWN_KIND);
      const removed = (await sql.query(
        `WITH removed AS (DELETE FROM size_guides WHERE kind = $1 RETURNING kind)
         ${logGuide("design.size_guide_removed", 2)} FROM removed RETURNING entity_id`,
        [kind, actor.authUserId, actor.email, "{}"],
      )) as unknown[];
      if (!removed.length) throw new AdminDataError("not_found", "Ese soporte no tiene guía de talles.");
    },
  };
}

export type SizeGuideRepository = ReturnType<typeof createSizeGuideRepository>;
