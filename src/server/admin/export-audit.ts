import type { QueryFn } from "../customers/repository.ts";
import type { Admin } from "./repository.ts";

/**
 * Audit trail for "export selected" (Admin › Actividad): personal data never
 * leaves the panel without a record of who exported what. Pure apart from the
 * INSERT, so the activity list (a client-safe module) can share describeExport.
 */
export type ExportKind = "products" | "orders" | "requests";

const TARGET: Record<ExportKind, { entity: "product" | "order"; action: string; one: string; many: string }> = {
  products: { entity: "product", action: "export.products", one: "producto seleccionado", many: "productos seleccionados" },
  orders: { entity: "order", action: "export.orders", one: "pedido seleccionado", many: "pedidos seleccionados" },
  requests: { entity: "order", action: "export.requests", one: "encargo seleccionado", many: "encargos seleccionados" },
};

/** One audit row per export: entity_id is "seleccion", changes keep { count, ids } as exported. */
export async function recordSelectionExport(sql: QueryFn, admin: Admin, kind: ExportKind, ids: readonly string[]): Promise<void> {
  const target = TARGET[kind];
  await sql.query(
    `INSERT INTO audit_logs (actor_auth_user_id, actor_email, action, entity, entity_id, changes)
     VALUES ($1, $2, $3, $4, 'seleccion', jsonb_build_object('count', $5::int, 'ids', $6::jsonb))`,
    [admin.authUserId, admin.email, target.action, target.entity, ids.length, JSON.stringify(ids)],
  );
}

/** "Exportó 3 pedidos seleccionados (CSV)"; null for any other action. */
export function describeExport(entry: { action: string; changes: Record<string, unknown> }): string | null {
  const target = Object.values(TARGET).find((candidate) => candidate.action === entry.action);
  if (!target) return null;
  const count = Number(entry.changes.count);
  return `Exportó ${count} ${count === 1 ? target.one : target.many} (CSV)`;
}

/** Whether an audit entry is a selection export (its subject is the area, not an id). */
export const isExportAction = (action: string) => action.startsWith("export.");
