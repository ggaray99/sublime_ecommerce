import { connection } from "next/server";
import { exportCatalog, toCsv } from "@/server/admin/csv";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { getSql } from "@/server/db/client";

/** GET /admin/productos/exportar — the catalog as a spreadsheet (CSV), for admins only. */
export async function GET() {
  // Request-time: reads the session and the live catalog (never prerendered).
  await connection();
  if (!adminAvailable() || !(await getCurrentAdmin())) return new Response("No encontrado", { status: 404 });
  const csv = toCsv(await exportCatalog(getSql()));
  const date = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sublime-productos-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
