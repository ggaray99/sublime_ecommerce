import type { QueryFn } from "../customers/repository.ts";
import { formatCsv, pesosCell } from "../../lib/csv.ts";
import { requestNumber, type RequestKind, type RequestStatus } from "../custom-requests/repository.ts";
import { argentinaDateTime } from "../orders/export.ts";

export const REQUEST_CSV_COLUMNS = ["encargo", "fecha", "cliente", "email", "tipo", "producto", "cantidad", "estado", "presupuesto", "sena", "idea", "referencia"] as const;

const KIND_LABEL: Record<RequestKind, string> = { free: "Formulario", sticker: "Stickers (Custom Lab)", tshirt: "Remera (Custom Lab)" };

type Row = {
  number: string | number;
  created_at: Date;
  contact_name: string;
  contact_email: string;
  kind: RequestKind | null;
  product_type: string;
  quantity: number;
  status: RequestStatus;
  quote_minor: string | number | null;
  deposit_minor: string | number | null;
  idea: string;
  reference: string;
};

/**
 * The selected custom requests as a spreadsheet, newest first; unknown ids are
 * skipped. Customer-typed text is neutralized against formulas. `statusLabel`
 * is the panel's wording (src/components/requests/request-view.tsx).
 */
export async function exportRequestsCsv(sql: QueryFn, ids: string[], statusLabel: Record<RequestStatus, string>): Promise<string> {
  const requests = (await sql.query(
    `SELECT number, created_at, contact_name, contact_email, kind, product_type, quantity, status, quote_minor, deposit_minor, idea, reference
     FROM custom_requests WHERE id = ANY ($1::uuid[]) ORDER BY created_at DESC, number DESC`,
    [ids],
  )) as Row[];
  const amount = (minor: string | number | null) => pesosCell(minor === null ? null : Number(minor));
  const rows = requests.map((row) => [
    requestNumber({ number: Number(row.number) }),
    argentinaDateTime(new Date(row.created_at)),
    row.contact_name,
    row.contact_email,
    KIND_LABEL[row.kind ?? "free"] ?? row.kind ?? "",
    row.product_type,
    String(row.quantity),
    statusLabel[row.status] ?? row.status,
    amount(row.quote_minor),
    amount(row.deposit_minor),
    row.idea,
    row.reference,
  ]);
  return formatCsv(REQUEST_CSV_COLUMNS, rows, { neutralizeFormulas: true });
}
