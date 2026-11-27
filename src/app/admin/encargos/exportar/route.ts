import { connection } from "next/server";
import { requestStatusLabel } from "@/components/requests/request-view";
import { exportSelection, UUID_ID } from "@/server/admin/selection-export";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { getSql } from "@/server/db/client";
import { exportRequestsCsv } from "@/server/requests/export";

/** POST /admin/encargos/exportar — the custom requests checked in the list ({ ids }) as a spreadsheet, for admins only. */
export async function POST(request: Request) {
  await connection();
  const admin = adminAvailable() ? await getCurrentAdmin() : null;
  return exportSelection({
    admin,
    request,
    idPattern: UUID_ID,
    filePrefix: "encargos-seleccionados",
    build: (ids) => exportRequestsCsv(getSql(), ids, requestStatusLabel),
  });
}
