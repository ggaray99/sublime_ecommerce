// Times the admin list queries on a large synthetic volume (PGlite): activity log,
// product history, orders and custom requests. Run: node scripts/bench/list-queries.mjs
// Pass --without-0018 to skip the newest migration and measure the "before" state.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createAdminRepository } from "../../src/server/admin/repository.ts";
import { createOrderRepository } from "../../src/server/orders/repository.ts";

const skip = process.argv.includes("--without-0018") ? (name) => name.startsWith("0018") : () => false;
const files = (folder) => readdirSync(join("db", folder)).filter((n) => n.endsWith(".sql") && !skip(n)).sort().map((n) => readFileSync(join("db", folder, n), "utf8"));
const db = new PGlite();
for (const text of [...files("migrations"), ...files("seed")]) await db.exec(text);

await db.exec(`
  INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes, created_at)
  SELECT 'a', 'a@example.com', 'product.update', (ARRAY['product','inventory','order','shipping'])[1 + g % 4],
         'p' || (g % 900), '{}'::jsonb, now() - (g || ' seconds')::interval
  FROM generate_series(1, 100000) g;
  INSERT INTO orders (access_token, contact_name, contact_email, delivery, status, subtotal_minor, idempotency_key, expires_at, created_at)
  SELECT repeat('a', 40), 'Cliente', 'c' || g || '@example.com', '{"method":"pickup"}',
         (ARRAY['pending_payment','paid','fulfilled','cancelled','expired'])[1 + g % 5], 100000, 'bench-key-' || g,
         now(), now() - (g || ' minutes')::interval
  FROM generate_series(1, 20000) g;
  ANALYZE;
`);
const sql = { query: async (text, params) => (await db.query(text, params)).rows };
const admin = createAdminRepository(sql);
const orders = createOrderRepository(sql);

async function time(label, run) {
  await run(); // warm up
  const samples = [];
  for (let i = 0; i < 15; i++) {
    const t0 = performance.now();
    await run();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  console.log(`${label.padEnd(46)} median ${samples[7].toFixed(2).padStart(7)} ms`);
}

await time("activity log (all, newest 50)", () => admin.listAudit({ limit: 50 }));
await time("activity log (products area)", () => admin.listAudit({ entity: "product", limit: 50 }));
await time("product history (entityId only)", () => admin.listAudit({ entityId: "p123", limit: 20 }));
await time("orders list (all, newest 100)", () => orders.listOrders({}));
await time("orders list (status paid)", () => orders.listOrders({ status: "paid" }));
await db.close();
