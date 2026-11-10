// Counts SQL round trips and time of the bulk admin operations (PGlite, seeded catalog).
// Run: node scripts/bench/bulk-queries.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { runBulkAsAdmin } from "../../src/server/api/handler.ts";
import { exportCatalog, importCatalog, toCsv } from "../../src/server/admin/csv.ts";

const files = (folder) => readdirSync(join("db", folder)).filter((n) => n.endsWith(".sql")).sort().map((n) => readFileSync(join("db", folder, n), "utf8"));
const db = new PGlite();
for (const text of [...files("migrations"), ...files("seed")]) await db.exec(text);
let count = 0;
const sql = { query: async (text, params) => (count++, (await db.query(text, params)).rows) };
const actor = { authUserId: "bench", email: "bench@example.com", role: "owner" };

async function measure(label, run) {
  count = 0;
  const t0 = performance.now();
  const result = await run();
  console.log(`${label.padEnd(44)} ${String(count).padStart(5)} queries ${String(Math.round(performance.now() - t0)).padStart(6)} ms`, result ?? "");
}

const skus = (await db.query("SELECT v.sku FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.active AND NOT p.requires_quote ORDER BY v.sku")).rows.map((r) => r.sku);
const tracked = (await db.query("SELECT sku FROM product_variants WHERE active AND track_stock ORDER BY sku")).rows.map((r) => r.sku);
console.log(`catalog: ${skus.length} priced SKUs, ${tracked.length} tracked SKUs`);

await measure("prices rule +5 % on whole catalog", async () => (await runBulkAsAdmin("prices/bulk-update", { rule: { type: "percent", value: 5 }, scope: { all: true } }, actor, sql)).body.summary);
await measure(`prices exact items (${skus.length})`, async () => (await runBulkAsAdmin("prices/bulk-update", { items: skus.map((sku, i) => ({ sku, priceMinor: 100000 + i * 100 })) }, actor, sql)).body.summary);
await measure(`stock count items (${tracked.length})`, async () => (await runBulkAsAdmin("stock/bulk-count", { items: tracked.map((sku, i) => ({ sku, onHand: 20 + (i % 7), reason: "adjustment", note: "bench" })) }, actor, sql)).body.summary);
await measure("products upsert by sku list (archive scope)", async () => (await runBulkAsAdmin("prices/bulk-update", { rule: { type: "amount", value: 100 }, scope: { skus: skus.slice(0, 40) } }, actor, sql)).body.summary);
const rows = await exportCatalog(sql);
const edited = rows.map((row, i) => ({ ...row, costo: String(1000 + i), peso_g: String(100 + i) }));
await measure(`CSV import apply (${rows.length} rows, cost+weight)`, async () => (await importCatalog(sql, actor, toCsv(edited), false)).summary);
await db.close();
