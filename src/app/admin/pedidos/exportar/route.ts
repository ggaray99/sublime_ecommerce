import { connection } from "next/server";
import { orderStatusLabel } from "@/components/orders/order-view";
import { recordSelectionExport } from "@/server/admin/export-audit";
import { exportSelection, UUID_ID } from "@/server/admin/selection-export";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { getSql } from "@/server/db/client";
import { exportOrdersCsv } from "@/server/orders/export";

/** POST /admin/pedidos/exportar — the orders checked in the list ({ ids }) as a spreadsheet, for admins only. */
export async function POST(request: Request) {
  await connection();
  const admin = adminAvailable() ? await getCurrentAdmin() : null;
  return exportSelection({
    admin,
    request,
    idPattern: UUID_ID,
    filePrefix: "pedidos-seleccionados",
    build: (ids) => exportOrdersCsv(getSql(), ids, orderStatusLabel),
    audit: (who, ids) => recordSelectionExport(getSql(), who, "orders", ids),
  });
}
