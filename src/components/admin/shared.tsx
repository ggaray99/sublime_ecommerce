import type { AdminProduct, AuditEntry } from "@/server/admin/repository";
import type { ProductStatus } from "@/server/admin/validation";
import { formatPrice } from "@/lib/format";

export const productStatusLabel: Record<ProductStatus, string> = {
  active: "Publicado",
  draft: "Borrador",
  archived: "Archivado",
};

export function stockLabel(product: Pick<AdminProduct, "trackStock" | "onHand" | "reserved">): string {
  if (!product.trackStock) return "A pedido";
  const available = product.onHand - product.reserved;
  return product.reserved ? `${available} (${product.reserved} reservadas)` : String(available);
}

const dateFormat = (date: Date) =>
  `${date.toISOString().slice(0, 10).split("-").reverse().join("/")} ${date.toISOString().slice(11, 16)} UTC`;

type Snapshot = { status?: string; priceMinor?: number | null };

const price = (value: number | null | undefined) => (value === null || value === undefined ? "sin precio" : formatPrice(value / 100));

/** Human summary of an audit entry, built from the stored before/after values. */
function describe(entry: AuditEntry): string {
  const changes = entry.changes;
  if (entry.action === "inventory.count") return `Stock ${changes.before} → ${changes.after}${changes.note ? ` (${changes.note})` : ""}`;
  if (entry.action === "admin.grant") return `Acceso de administración: ${changes.email} como ${changes.role}`;
  if (entry.action === "product.update") {
    const before = (changes.before ?? {}) as Snapshot;
    const after = (changes.after ?? {}) as Snapshot;
    const parts = [];
    if (before.status !== after.status) {
      parts.push(`estado ${productStatusLabel[before.status as ProductStatus]} → ${productStatusLabel[after.status as ProductStatus]}`);
    }
    if (before.priceMinor !== after.priceMinor) parts.push(`precio ${price(before.priceMinor)} → ${price(after.priceMinor)}`);
    return parts.join(", ") || "Sin cambios";
  }
  return entry.action;
}

export function AuditList({ entries }: { entries: AuditEntry[] }) {
  if (!entries.length) return <p className="muted">Todavía no hay cambios registrados.</p>;
  return (
    <ol className="audit-list">
      {entries.map((entry) => (
        <li key={entry.id}>
          <p>
            <strong>{entry.entity === "admin" ? "Accesos" : entry.entityId}</strong> · {describe(entry)}
          </p>
          <p className="muted">
            {entry.actorEmail} · <time dateTime={entry.createdAt.toISOString()}>{dateFormat(entry.createdAt)}</time>
          </p>
        </li>
      ))}
    </ol>
  );
}

/** Shown where the admin panel cannot run (production today). */
export function AdminUnavailable() {
  return (
    <div className="empty-state">
      <h2>Panel no disponible en este entorno.</h2>
      <p>La administración funciona solo en el entorno de prueba, con cuentas y base de datos de staging.</p>
    </div>
  );
}
