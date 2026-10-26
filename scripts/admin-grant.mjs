// Grants the admin panel to an existing customer account (--target=staging or --target=production).
//
//   npm run admin:grant -- --email=persona@example.com --role=owner
//
// The person must have signed up and opened /cuenta once, so their Neon Auth id is
// linked in customers. Roles: owner | editor. The grant is written to audit_logs.
// The connection string is never printed.
import pg from "pg";
import { createAdminRepository } from "../src/server/admin/repository.ts";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, "").split("=");
    return [key, value.join("=")];
  }),
);

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

// The target must match the environment of DATABASE_URL (same rule as db-migrate.mjs).
const production = process.env.SUBLIME_ENV === "production" || process.env.VERCEL_ENV === "production";
if (args.target === "production") {
  if (!production) fail("--target=production solo corre con SUBLIME_ENV=production.");
} else if (args.target === "staging") {
  if (production) fail("Entorno de producción: usá --target=production.");
} else {
  fail("Indicá --target=staging o --target=production.");
}
if (!process.env.DATABASE_URL) fail("Falta DATABASE_URL (por ejemplo: node --env-file=.env.local …).");

const email = (args.email ?? "").trim().toLowerCase();
const role = args.role ?? "editor";
if (!email.includes("@")) fail("Indicá --email=persona@dominio.");
if (!["owner", "editor"].includes(role)) fail("--role debe ser owner o editor.");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const query = async (text, params) => (await pool.query(text, params)).rows;
  const [customer] = await query("SELECT auth_user_id, email FROM customers WHERE email = $1", [email]);
  if (!customer) fail(`No hay un cliente con ese email. Que se registre y abra /cuenta una vez.`);
  await createAdminRepository({ query }).grantAdmin(
    { authUserId: customer.auth_user_id, email: customer.email },
    role,
    "script:admin-grant",
  );
  console.log(`✔ ${email} ahora es ${role} del panel /admin.`);
} finally {
  await pool.end();
}
