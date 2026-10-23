// Import rehearsal: maps the static catalog to the 0001 schema without touching
// any database. Run with `npm run db:dry-run`; writes db/seed/0001_catalog_seed.sql
// for review and exits with code 1 if any constraint would be violated.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { categories } from "../src/data/categories.ts";
import { products } from "../src/data/products.ts";
import { buildImportPlan, renderSeedSql } from "../src/server/catalog/import-plan.ts";

const plan = buildImportPlan(categories, products);

console.log(
  `Categorías: ${plan.categories.length} · Productos: ${plan.products.length} · ` +
    `Variantes: ${plan.variants.length} · Imágenes: ${plan.images.length}`,
);
console.log(
  `A cotizar: ${plan.variants.filter((variant) => variant.price_minor === null).length} · ` +
    `Con código de catálogo: ${plan.products.filter((product) => product.catalog_code).length}`,
);

if (plan.errors.length) {
  console.error(`\n${plan.errors.length} problema(s):`);
  for (const error of plan.errors) console.error(`  - ${error}`);
  process.exit(1);
}

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "seed", "0001_catalog_seed.sql");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, renderSeedSql(plan));
console.log(`\nSin problemas. Seed generado para revisión: db/seed/0001_catalog_seed.sql`);
