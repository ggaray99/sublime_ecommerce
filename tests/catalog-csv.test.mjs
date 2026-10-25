// Catalog spreadsheet: CSV format, export and import (preview, then apply) over PGlite.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { exportCatalog, importCatalog, parseCsv, toCsv } from "../src/server/admin/csv.ts";

const files = (folder) => readdirSync(join("db", folder)).filter((n) => n.endsWith(".sql")).sort().map((n) => readFileSync(join("db", folder, n), "utf8"));
const actor = { authUserId: "admin-1", email: "admin@example.com", role: "owner" };

describe("CSV format", () => {
  it("round-trips quotes, separators and accents; reads comma files too", () => {
    const csv = toCsv([{ sku: "A-1", nombre: 'Taza "Kiss"; edición' }]);
    assert.ok(csv.startsWith("﻿sku;producto;nombre"));
    const parsed = parseCsv(csv);
    assert.equal(parsed.rows[0][2], 'Taza "Kiss"; edición');
    assert.deepEqual(parseCsv("SKU,precio\nA-1,\"1.500,50\"\n\n").rows, [["A-1", "1.500,50"]]);
    assert.deepEqual(parseCsv("SKU,precio\nA-1,10").header, ["sku", "precio"]);
  });
});

describe("export and import (PGlite)", () => {
  let db;
  let sql;
  before(async () => {
    db = new PGlite();
    for (const text of [...files("migrations"), ...files("seed")]) await db.exec(text);
    sql = { query: async (text, params) => (await db.query(text, params)).rows };
  });
  after(() => db.close());

  it("exports one row per SKU and re-imports it unchanged", async () => {
    const rows = await exportCatalog(sql);
    assert.ok(rows.length > 10);
    const p08 = rows.find((row) => row.sku === "SUB-P08");
    assert.equal(p08.precio, "8900");
    const report = await importCatalog(sql, actor, toCsv(rows.slice(0, 20)), true);
    assert.equal(report.summary.failed, 0, JSON.stringify(report.lines.filter((l) => l.result === "failed")));
    assert.equal(report.summary.updated + report.summary.created, 0);
  });

  it("previews without writing, then applies price, cost, stock, weight and a new product", async () => {
    const [category] = (await db.query("SELECT id FROM categories ORDER BY id LIMIT 1")).rows;
    const csv = [
      "sku;precio;costo;stock;peso_g;largo_cm;nombre;categoria",
      "SUB-P08;9.500;3.000;12;180;30,5;;",
      `SUB-NUEVO-1;1500;;4;;;Producto de planilla;${category.id}`,
      "SUB-P09;mucho;;;;;;",
      "NO-EXISTE-NI-NOMBRE;;;;;;;",
    ].join("\n");
    const preview = await importCatalog(sql, actor, csv, true);
    assert.deepEqual(
      preview.lines.map((line) => line.result),
      ["updated", "created", "failed", "failed"],
      JSON.stringify(preview.lines),
    );
    const before = (await db.query("SELECT price_minor FROM product_variants WHERE sku = 'SUB-P08'")).rows[0];
    assert.equal(Number(before.price_minor), 890000, "preview wrote nothing");

    const applied = await importCatalog(sql, actor, csv, false);
    assert.equal(applied.summary.created, 1);
    const [row] = (
      await db.query(
        "SELECT v.price_minor, v.cost_minor, i.on_hand, p.weight_g, p.length_mm FROM product_variants v JOIN products p ON p.id = v.product_id LEFT JOIN inventory i ON i.variant_id = v.id WHERE v.sku = 'SUB-P08'",
      )
    ).rows;
    assert.deepEqual([Number(row.price_minor), Number(row.cost_minor), row.on_hand, row.weight_g, row.length_mm], [950000, 300000, 12, 180, 305]);
    const [created] = (await db.query("SELECT p.status, p.name FROM products p JOIN product_variants v ON v.product_id = p.id WHERE v.sku = 'SUB-NUEVO-1'")).rows;
    assert.deepEqual([created.status, created.name], ["draft", "Producto de planilla"]);
  });

  it("rejects files without sku or with unknown columns", async () => {
    assert.ok((await importCatalog(sql, actor, "precio\n10", true)).error);
    assert.ok((await importCatalog(sql, actor, "sku;color\nA;rojo", true)).error);
  });
});
