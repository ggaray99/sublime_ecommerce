// Size-guide tables per base product kind (Admin › Soportes, store design page).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { AdminDataError } from "../src/server/admin/repository.ts";
import { createMockupTemplateRepository } from "../src/server/mockups/templates-repository.ts";
import {
  createSizeGuideRepository,
  EXAMPLE_SIZE_GUIDE_HEADERS,
  parseSizeGuide,
  SIZE_GUIDE_LIMITS,
  storeSizeGuides,
} from "../src/server/designs/size-guides.ts";

const dbDir = join(import.meta.dirname, "..", "db");
const sqlFiles = (folder) =>
  readdirSync(join(dbDir, folder))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(dbDir, folder, name), "utf8"));

const admin = { authUserId: "auth-admin", email: "admin@example.com", role: "owner" };
const table = (headers, rows) => JSON.stringify({ headers, rows });

describe("size guide parser", () => {
  it("trims cells and the note, and drops fully empty rows", () => {
    const result = parseSizeGuide({
      table: table([" Talle ", "Ancho (cm)"], [[" S ", " 48 "], ["", "  "], ["M", "50"]]),
      note: "  Medidas aproximadas.  ",
    });
    assert.deepEqual(result, { guide: { headers: ["Talle", "Ancho (cm)"], rows: [["S", "48"], ["M", "50"]], note: "Medidas aproximadas." } });
  });

  it("keeps a row with only some cells filled", () => {
    const result = parseSizeGuide({ table: table(["Talle", "Largo"], [["XL", ""]]), note: "" });
    assert.deepEqual(result.guide.rows, [["XL", ""]]);
  });

  it("asks for at least one column", () => {
    assert.deepEqual(parseSizeGuide({ table: table([], []), note: "" }), { error: "La tabla necesita al menos una columna." });
  });

  it("asks for a title on every column", () => {
    assert.deepEqual(parseSizeGuide({ table: table(["Talle", "  "], [["S", "1"]]), note: "" }), { error: "Cada columna necesita un título." });
  });

  it("asks for at least one row once empty rows are dropped", () => {
    assert.deepEqual(parseSizeGuide({ table: table(["Talle"], [["  "]]), note: "" }), { error: "Agregá al menos una fila con datos." });
  });

  it("refuses more than 8 columns or 30 rows", () => {
    const tooMany = { error: "Máximo 8 columnas y 30 filas." };
    const nine = Array.from({ length: 9 }, (_, index) => `C${index}`);
    assert.deepEqual(parseSizeGuide({ table: table(nine, [nine]), note: "" }), tooMany);
    const rows = Array.from({ length: 31 }, (_, index) => [`T${index}`]);
    assert.deepEqual(parseSizeGuide({ table: table(["Talle"], rows), note: "" }), tooMany);
    const limit = Array.from({ length: SIZE_GUIDE_LIMITS.rows }, (_, index) => [`T${index}`]);
    assert.equal(parseSizeGuide({ table: table(["Talle"], limit), note: "" }).guide.rows.length, 30);
    assert.equal(SIZE_GUIDE_LIMITS.columns, 8);
  });

  it("refuses rows without one cell per column, broken tables, long cells and long notes", () => {
    assert.deepEqual(parseSizeGuide({ table: table(["Talle", "Ancho"], [["S"]]), note: "" }), {
      error: "Cada fila debe tener una celda por columna.",
    });
    assert.deepEqual(parseSizeGuide({ table: "{no es json", note: "" }), { error: "No pudimos leer la tabla. Recargá la página y probá de nuevo." });
    assert.deepEqual(parseSizeGuide({ table: table(["Talle"], [[42]]), note: "" }), { error: "No pudimos leer la tabla. Recargá la página y probá de nuevo." });
    assert.deepEqual(parseSizeGuide({ table: table(["Talle"], [["x".repeat(41)]]), note: "" }), {
      error: "Cada celda admite hasta 40 caracteres.",
    });
    assert.deepEqual(parseSizeGuide({ table: table(["Talle"], [["S"]]), note: "x".repeat(301) }), { error: "La nota admite hasta 300 caracteres." });
  });

  it("offers example headers for an empty guide", () => {
    assert.deepEqual(EXAMPLE_SIZE_GUIDE_HEADERS, ["Talle", "Ancho (cm)", "Largo (cm)"]);
  });
});

describe("size guide repository", () => {
  let db;
  let sql;
  let repo;
  const guide = { headers: ["Talle", "Ancho (cm)", "Largo (cm)"], rows: [["S", "48", "70"], ["M", "50", "72"]], note: "Medidas de la prenda." };

  before(async () => {
    db = new PGlite();
    for (const text of [...sqlFiles("migrations"), ...sqlFiles("seed")]) await db.exec(text);
    sql = { query: async (text, params) => (await db.query(text, params)).rows };
    repo = createSizeGuideRepository(sql);
  });

  after(async () => {
    await db.close();
  });

  it("reads a kind without a guide as none, and lists nothing", async () => {
    assert.equal(await repo.getSizeGuide("tshirt"), null);
    assert.deepEqual(await repo.listSizeGuides(), []);
    assert.deepEqual(storeSizeGuides(await repo.listSizeGuides()), {});
  });

  it("saves a guide, logs it and reads it back", async () => {
    await repo.saveSizeGuide(admin, "tshirt", guide);
    const saved = await repo.getSizeGuide("tshirt");
    assert.ok(saved.updatedAt instanceof Date);
    assert.deepEqual({ ...saved, updatedAt: undefined }, { kind: "tshirt", ...guide, updatedAt: undefined });
    const logs = await sql.query(`SELECT action, entity, entity_id, actor_email, changes FROM audit_logs WHERE entity_id = 'size-guide-tshirt'`);
    assert.deepEqual(logs, [
      { action: "design.size_guide", entity: "design", entity_id: "size-guide-tshirt", actor_email: admin.email, changes: guide },
    ]);
  });

  it("replaces the guide of the same kind and lists guides by kind", async () => {
    const tank = { headers: ["Talle"], rows: [["S"], ["XXL"]], note: "" };
    await repo.saveSizeGuide(admin, "tank", tank);
    await repo.saveSizeGuide(admin, "tshirt", { ...guide, note: "" });
    const list = await repo.listSizeGuides();
    assert.deepEqual(
      list.map(({ kind, note }) => [kind, note]),
      [
        ["tank", ""],
        ["tshirt", ""],
      ],
    );
    assert.deepEqual(storeSizeGuides(list), {
      tank: { headers: tank.headers, rows: tank.rows, note: "" },
      tshirt: { headers: guide.headers, rows: guide.rows, note: "" },
    });
    const [{ count }] = await sql.query(`SELECT count(*)::int AS count FROM audit_logs WHERE entity_id = 'size-guide-tshirt'`);
    assert.equal(count, 2);
  });

  it("refuses an unknown kind before touching the database", async () => {
    await assert.rejects(() => repo.saveSizeGuide(admin, "gorra", guide), AdminDataError);
    await assert.rejects(() => repo.deleteSizeGuide(admin, "gorra"), AdminDataError);
    assert.equal(await repo.getSizeGuide("gorra"), null);
  });

  it("validates the guide shape on save", async () => {
    await assert.rejects(
      () => repo.saveSizeGuide(admin, "mug", { headers: [], rows: [], note: "" }),
      (error) => error instanceof AdminDataError && error.message === "La tabla necesita al menos una columna.",
    );
    assert.equal(await repo.getSizeGuide("mug"), null);
  });

  it("removes a guide with its audit row, and refuses removing a missing one", async () => {
    await repo.deleteSizeGuide(admin, "tank");
    assert.equal(await repo.getSizeGuide("tank"), null);
    const [log] = await sql.query(`SELECT action, entity, changes FROM audit_logs WHERE entity_id = 'size-guide-tank' AND action = 'design.size_guide_removed'`);
    assert.deepEqual(log, { action: "design.size_guide_removed", entity: "design", changes: {} });
    await assert.rejects(() => repo.deleteSizeGuide(admin, "tank"), (error) => error instanceof AdminDataError && error.message === "Ese soporte no tiene guía de talles.");
  });

  it("rejects a bad kind, a ragged row, non-string cells and too many columns in SQL", async () => {
    const insert = (kind, headers, rows) => sql.query(`INSERT INTO size_guides (kind, headers, rows) VALUES ($1, $2, $3::jsonb)`, [kind, headers, JSON.stringify(rows)]);
    await assert.rejects(() => insert("gorra", ["Talle"], [["S"]]));
    await assert.rejects(() => insert("mug", ["Talle", "Ancho"], [["S"]]));
    await assert.rejects(() => insert("mug", ["Talle"], [[1]]));
    await assert.rejects(() => insert("mug", Array.from({ length: 9 }, () => "x"), [Array.from({ length: 9 }, () => "y")]));
    await assert.rejects(() => insert("mug", [], []));
    await insert("oversize", ["Talle"], [["XL"]]);
    const [stored] = await sql.query(`SELECT rows FROM size_guides WHERE kind = 'oversize'`);
    assert.deepEqual(stored.rows, [["XL"]]);
    await sql.query(`DELETE FROM size_guides WHERE kind = 'oversize'`);
  });

  it("leaves the Soportes templates untouched", async () => {
    assert.deepEqual(await createMockupTemplateRepository(sql).listTemplates(), []);
  });
});
