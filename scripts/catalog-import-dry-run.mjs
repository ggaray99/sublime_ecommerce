// Import rehearsal: maps the static catalog to the 0001 schema without touching
// any database. Run with `npm run db:dry-run`; writes db/seed/0001_catalog_seed.sql
// for review and exits with code 1 if any constraint would be violated.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { categories } from "../src/data/categories.ts";
import { products } from "../src/data/products.ts";
import { buildImportPlan, renderContentSql, renderSeedSql } from "../src/server/catalog/import-plan.ts";

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

const seedDir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "seed");
mkdirSync(seedDir, { recursive: true });
writeFileSync(join(seedDir, "0001_catalog_seed.sql"), renderSeedSql(plan));
writeFileSync(join(seedDir, "0002_catalog_content.sql"), renderContentSql(categories, products));
console.log(`\nSin problemas. Seeds generados para revisión: db/seed/0001_catalog_seed.sql y 0002_catalog_content.sql`);
