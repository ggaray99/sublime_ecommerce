// Applies db/migrations/*.sql (and, on staging, the demo seeds) to a database.
//
//   node --env-file=.env.local scripts/db-migrate.mjs --target=staging            # status only
//   node --env-file=.env.local scripts/db-migrate.mjs --target=staging --apply    # apply pending migrations
//   node --env-file=.env.local scripts/db-migrate.mjs --target=staging --apply --seed
//   node scripts/db-migrate.mjs --target=production --apply                         # inside the VPS, SUBLIME_ENV=production
//
// Each file runs in its own transaction together with its row in schema_migrations,
// so a failure leaves nothing half-applied. Applied files are checksummed: editing
// one after it ran aborts the run. The connection string is never printed.
import pg from "pg";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "db");

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

// The target must match the environment of DATABASE_URL, so a staging command can
// never touch production and the other way round. Production never takes the
// demo seeds: its catalog is loaded from the admin panel.
const production = process.env.SUBLIME_ENV === "production" || process.env.VERCEL_ENV === "production";
if (args.has("--target=production")) {
  if (!production) fail("--target=production solo corre con SUBLIME_ENV=production.");
  if (args.has("--seed")) fail("Producción no lleva los datos de prueba (--seed).");
} else if (args.has("--target=staging")) {
  if (production) fail("Entorno de producción: usá --target=production.");
} else {
  fail("Indicá --target=staging o --target=production.");
}
if (!process.env.DATABASE_URL) fail("Falta DATABASE_URL (por ejemplo: node --env-file=.env.local …).");

const files = [
  ...readdirSync(join(root, "migrations"))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort()
    .map((name) => ({ name: `migrations/${name}`, path: join(root, "migrations", name) })),
  ...(args.has("--seed")
    ? readdirSync(join(root, "seed"))
        .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
        .sort()
        .map((name) => ({ name: `seed/${name}`, path: join(root, "seed", name) }))
    : []),
].map((file) => {
  // Checksums ignore line endings: Git on Windows may rewrite LF as CRLF on checkout.
  const sql = readFileSync(file.path, "utf8").replace(/\r\n/g, "\n");
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(sql)) fail(`${file.name} no debe manejar su propia transacción.`);
  const checksum = createHash("sha256").update(sql).digest("hex");
  // Files applied before this normalization may have been hashed with CRLF.
  const crlfChecksum = createHash("sha256").update(sql.replace(/\n/g, "\r\n")).digest("hex");
  return { ...file, sql, checksum, accepted: new Set([checksum, crlfChecksum]) };
});

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const { rows } = await client.query("SELECT name, checksum FROM schema_migrations");
  const applied = new Map(rows.map((row) => [row.name, row.checksum]));

  for (const [name, checksum] of applied) {
    const file = files.find((candidate) => candidate.name === name);
    if (file && !file.accepted.has(checksum)) fail(`${name} cambió después de aplicarse. Creá una migración nueva.`);
  }

  const pending = files.filter((file) => !applied.has(file.name));
  console.log(`Aplicadas: ${applied.size} · Pendientes: ${pending.length}`);
  for (const file of pending) console.log(`  · ${file.name}`);

  if (!args.has("--apply")) {
    console.log("\nSolo estado. Agregá --apply para ejecutar.");
  } else {
    for (const file of pending) {
      await client.query("BEGIN");
      try {
        await client.query(file.sql);
        await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [file.name, file.checksum]);
        await client.query("COMMIT");
        console.log(`✔ ${file.name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        fail(`${file.name}: ${error.message}`);
      }
    }
    console.log("\nListo.");
  }
} finally {
  client.release();
  await pool.end();
}
