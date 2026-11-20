import { connection } from "next/server";
import { AdminDataError } from "@/server/admin/repository";
import { adminAvailable, getCurrentAdmin, getDesignRepository } from "@/server/admin/session";
import { readDesignSourceFile } from "@/server/designs/files";

const notFound = () => new Response("No encontrado", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * GET /admin/disenos/[id]/archivo — the full-resolution PNG for production, for
 * admins only (everyone else gets a 404). Always a download, never inline.
 */
export async function GET(_request: Request, { params }: RouteContext<"/admin/disenos/[id]/archivo">) {
  // Request-time: reads the session (never prerendered).
  await connection();
  if (!adminAvailable() || !(await getCurrentAdmin())) return notFound();
  const { id } = await params;
  const design = await getDesignRepository()
    .getDesign(id)
    .catch((error) => {
      if (error instanceof AdminDataError) return null;
      throw error;
    });
  if (!design?.sourcePath) return notFound();

  const bytes = await readDesignSourceFile("private", design.sourcePath);
  if (!bytes) return notFound();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${design.slug}.png"`,
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
