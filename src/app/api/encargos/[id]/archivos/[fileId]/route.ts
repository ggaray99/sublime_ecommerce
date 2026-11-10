import { getCurrentAdmin } from "@/server/admin/session";
import { customRequestsAvailable, getCustomRequestRepository } from "@/server/custom-requests/session";
import { getCurrentCustomer } from "@/server/customers/session";
import { readPrivateFile } from "@/server/media/private-files";

const notFound = () => new Response("No encontrado", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Serves a custom request's reference file from private storage, only to whoever
 * may see the request: the private link's token, the customer who made it, or an admin.
 * Always as a download, never rendered inline (a PDF or image cannot run in the site's origin).
 */
export async function GET(request: Request, { params }: RouteContext<"/api/encargos/[id]/archivos/[fileId]">) {
  if (!customRequestsAvailable()) return notFound();
  const { id, fileId } = await params;
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const repo = getCustomRequestRepository();

  let allowed = await repo.getByToken(id, token);
  if (!allowed) {
    const detail = await repo.get(id).catch(() => null);
    if (detail) {
      const [customer, admin] = await Promise.all([getCurrentCustomer().catch(() => null), getCurrentAdmin().catch(() => null)]);
      if (admin || (customer && detail.customerId === customer.id)) allowed = detail;
    }
  }
  const file = allowed?.files.find((candidate) => candidate.id === fileId);
  if (!file) return notFound();

  const blob = await readPrivateFile(file.pathname);
  if (!blob) return notFound();
  const filename = file.originalName.replace(/[^\w.\- ]+/g, "_");
  return new Response(blob.stream, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
