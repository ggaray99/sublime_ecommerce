import { themes } from "@/data/products";
import { DESIGN_STATUS_LABELS, isMockupKind, MOCKUP_KIND_LABELS, type DesignStatus } from "@/lib/designs/kinds";
import { formatPrice } from "@/lib/format";
import type { AdminProduct, AuditEntry } from "@/server/admin/repository";
import { getCategoryRepository } from "@/server/admin/session";
import type { ProductStatus } from "@/server/admin/validation";
import type { Option, ProductFormValues } from "./forms";

export const productStatusLabel: Record<ProductStatus, string> = {
  active: "Publicado",
  draft: "Borrador",
  archived: "Archivado",
};

/** Categories from the database, hidden ones marked, for the product form. */
export async function loadCategoryOptions(): Promise<Option[]> {
  const categories = await getCategoryRepository().listCategories();
  return categories.map((category) => ({ value: category.id, label: category.active ? category.label : `${category.label} (oculta)` }));
}
export const themeOptions: Option[] = Object.entries(themes).map(([value, label]) => ({ value, label }));

/** Formats centavos for the price input ("2500" or "2500,50"). */
export const priceInput = (minor: number | null) =>
  minor === null ? "" : minor % 100 ? `${Math.floor(minor / 100)},${String(minor % 100).padStart(2, "0")}` : String(minor / 100);

export function productFormValues(product: AdminProduct): ProductFormValues {
  return {
    name: product.name,
    slug: product.slug,
    description: product.description,
    categoryId: product.categoryId,
    theme: product.theme,
    tags: product.tags.join(", "),
    details: product.details.join("\n"),
    featured: product.featured,
    catalogCode: product.catalogCode ?? "",
    price: priceInput(product.priceMinor),
    status: product.status,
  };
}

export function stockLabel(product: Pick<AdminProduct, "trackStock" | "onHand" | "reserved">): string {
  if (!product.trackStock) return "A pedido";
  const available = product.onHand - product.reserved;
  return product.reserved ? `${available} (${product.reserved} reservadas)` : String(available);
}

const dateFormat = (date: Date) =>
  `${date.toISOString().slice(0, 10).split("-").reverse().join("/")} ${date.toISOString().slice(11, 16)} UTC`;

type Snapshot = { status?: string; priceMinor?: number | null };

const price = (value: unknown) => (typeof value === "number" ? formatPrice(value / 100) : "sin precio");

const FIELD_LABEL: Record<string, string> = {
  name: "nombre",
  slug: "URL",
  description: "descripción",
  categoryId: "categoría",
  theme: "temática",
  tags: "etiquetas",
  details: "material y uso",
  featured: "destacado",
  catalogCode: "código",
  status: "estado",
  priceMinor: "precio",
};

/** Short, readable before → after for one field. Long texts only say they changed. */
function fieldChange(field: string, before: unknown, after: unknown): string {
  const label = FIELD_LABEL[field] ?? field;
  if (field === "priceMinor") return `${label} ${price(before)} → ${price(after)}`;
  if (field === "status") return `${label} ${productStatusLabel[before as ProductStatus]} → ${productStatusLabel[after as ProductStatus]}`;
  if (field === "featured") return after ? "marcado como destacado" : "quitado de destacados";
  if (field === "description" || field === "details" || field === "tags") return `${label} actualizado`;
  return `${label} "${before ?? ""}" → "${after ?? ""}"`;
}

/** Human summary of an audit entry, built from the stored before/after values. */
function describe(entry: AuditEntry): string {
  const changes = entry.changes;
  if (entry.action === "inventory.count") return `Stock ${changes.before} → ${changes.after}${changes.note ? ` (${changes.note})` : ""}`;
  if (entry.action === "integration.create") return `Clave de API creada (${(changes.scopes as string[] | undefined)?.join(", ") ?? ""})`;
  if (entry.action === "integration.revoke") return "Clave de API revocada";
  if (entry.action === "admin.grant") return `Acceso de administración: ${changes.email} como ${changes.role}`;
  if (entry.action.startsWith("image.")) {
    const verb = { add: "Imagen agregada", alt: "Texto de imagen actualizado", move: "Imagen reordenada", remove: "Imagen quitada" };
    return verb[entry.action.slice(6) as keyof typeof verb] ?? entry.action;
  }
  if (entry.action.startsWith("category.")) {
    const verb = { create: "Categoría creada", update: "Categoría actualizada", image: "Imagen de categoría actualizada", delete: "Categoría eliminada" };
    return verb[entry.action.slice(9) as keyof typeof verb] ?? entry.action;
  }
  const verbs: Record<string, string> = {
    "shipping.create": "Regla de envío creada",
    "shipping.update": "Regla de envío actualizada",
    "shipping.delete": "Regla de envío eliminada",
    "shipping.pickup": "Punto de retiro actualizado",
    "point.create": "Punto de venta creado",
    "point.update": "Punto de venta actualizado",
    "point.delete": "Punto de venta eliminado",
    "home.hero": "Portada actualizada",
    "settings.contact": "Datos de contacto actualizados",
    "settings.page": "Texto de una página informativa actualizado",
    "settings.lab_pricing": "Precios de stickers a medida actualizados",
    "settings.store_status": changes.closed ? "Tienda cerrada al público (Estamos trabajando)" : "Tienda abierta al público",
    "variant.options": "Opciones de variantes actualizadas",
    "variant.update": "Variante actualizada",
    "promotion.create": "Promoción creada",
    "promotion.update": "Promoción actualizada",
    "promotion.activate": "Promoción activada",
    "promotion.deactivate": "Promoción pausada",
    "promotion.delete": "Promoción eliminada",
    "design.create": "Diseño creado",
    "design.update": "Diseño actualizado",
    "design.image": "Imagen del diseño actualizada",
    "design.status": `Diseño ${DESIGN_STATUS_LABELS[changes.after as DesignStatus]?.toLowerCase() ?? changes.after}`,
    "design.delete": "Diseño eliminado",
    "design.base": changes.productId ? "Producto base vinculado" : "Producto base desvinculado",
    "product.extras": "Venta y logística actualizadas",
    "product.duplicate": `Copia de ${changes.from}`,
    "product.import": `Planilla importada (${changes.sku})`,
  };
  if (verbs[entry.action]) return verbs[entry.action];
  if (entry.action === "product.create") return `Alta de "${changes.name}" (${productStatusLabel[changes.status as ProductStatus] ?? changes.status})`;
  if (entry.action === "product.update") {
    // Entries before 0004 stored { before: {...}, after: {...} } with status and price only.
    if ("before" in changes && "after" in changes) {
      const before = changes.before as Snapshot;
      const after = changes.after as Snapshot;
      const parts = [];
      if (before.status !== after.status) parts.push(fieldChange("status", before.status, after.status));
      if (before.priceMinor !== after.priceMinor) parts.push(fieldChange("priceMinor", before.priceMinor, after.priceMinor));
      return parts.join(", ") || "Sin cambios";
    }
    return Object.entries(changes as Record<string, { before: unknown; after: unknown }>)
      .map(([field, change]) => fieldChange(field, change.before, change.after))
      .join(", ");
  }
  return entry.action;
}

/** Areas of the panel, as the activity page filters them. */
export const AUDIT_AREAS = {
  product: "Productos",
  inventory: "Stock",
  category: "Categorías",
  shipping: "Envíos",
  point: "Puntos de venta",
  home: "Portada",
  promotion: "Promociones",
  design: "Diseños",
  settings: "Ajustes",
  integration: "Integraciones",
  admin: "Accesos",
} as const;

/** What the entry is about: a name when the change stored one, otherwise the area and id. */
function subject(entry: AuditEntry): string {
  const name = (entry.changes as { name?: unknown; label?: unknown }).name ?? (entry.changes as { label?: unknown }).label;
  if (entry.entity === "admin") return "Accesos";
  if (entry.entity === "integration") return `Integración ${entry.entityId}`;
  if (entry.entity === "home") return "Portada";
  if (entry.entity === "settings") return "Ajustes";
  if (entry.entity === "design" && isMockupKind(entry.entityId)) return `Base de ${MOCKUP_KIND_LABELS[entry.entityId]}`;
  if (entry.entity === "point" || entry.entity === "shipping" || entry.entity === "promotion" || entry.entity === "design") {
    return typeof name === "string" ? name : AUDIT_AREAS[entry.entity];
  }
  return entry.entityId;
}

export function AuditList({ entries }: { entries: AuditEntry[] }) {
  if (!entries.length) return <p className="muted">Todavía no hay cambios registrados.</p>;
  return (
    <ol className="audit-list">
      {entries.map((entry) => (
        <li key={entry.id}>
          <p>
            <strong>{subject(entry)}</strong> · {describe(entry)}
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
      <p>La administración no está habilitada en este entorno.</p>
    </div>
  );
}
