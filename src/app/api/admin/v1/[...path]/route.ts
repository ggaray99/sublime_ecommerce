import { revalidateTag } from "next/cache";
import { handleAdminApi } from "@/server/api/handler";
import { getSql, hasDatabase } from "@/server/db/client";
import { CATALOG_TAG } from "@/server/storefront";

/**
 * /api/admin/v1/* — Sublime's admin API for integrations. Contract:
 * /api/admin/v1/openapi.json (docs/backend/api-admin-v1.md).
 */
async function handle(request: Request, { params }: RouteContext<"/api/admin/v1/[...path]">) {
  const { path } = await params;
  const available = hasDatabase();
  return handleAdminApi(request, path, {
    sql: available ? getSql() : { query: async () => [] },
    available,
    // Integrations expect the store to reflect their change right away.
    onCatalogChange: () => revalidateTag(CATALOG_TAG, { expire: 0 }),
  });
}

export { handle as GET, handle as PATCH, handle as POST };
