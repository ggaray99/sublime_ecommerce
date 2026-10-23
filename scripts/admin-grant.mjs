// Grants the admin panel to an existing customer account on the STAGING database.
//
//   npm run admin:grant -- --email=persona@example.com --role=owner
//
// The person must have signed up and opened /cuenta once, so their Neon Auth id is
// linked in customers. Roles: owner | editor. The grant is written to audit_logs.
// The connection string is never printed.
import { Pool } from "@neondatabase/serverless";
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

if (args.target !== "staging") fail("Indicá --target=staging. Este script no está habilitado para producción.");
if (process.env.VERCEL_ENV === "production") fail("VERCEL_ENV=production: ejecución bloqueada.");
if (!process.env.DATABASE_URL) fail("Falta DATABASE_URL (por ejemplo: node --env-file=.env.local …).");

const email = (args.email ?? "").trim().toLowerCase();
const role = args.role ?? "editor";
if (!email.includes("@")) fail("Indicá --email=persona@dominio.");
if (!["owner", "editor"].includes(role)) fail("--role debe ser owner o editor.");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
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
