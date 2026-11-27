import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { InventoryFilters } from "@/components/admin/inventory/list-filters";
import { InventoryListSkeleton } from "@/components/admin/inventory/list-skeleton";
import { InventorySummaryCards } from "@/components/admin/inventory/list-summary";
import { InventoryListTable } from "@/components/admin/inventory/list-table";
import styles from "@/components/admin/products/list.module.css";
import { AdminUnavailable } from "@/components/admin/shared";
import { Button, Card, EmptyState, PageHeader, Pagination, Stack } from "@/components/admin/ui";
import { adminAvailable, getCategoryRepository, getCurrentAdmin } from "@/server/admin/session";
import { getSql } from "@/server/db/client";
import { inventorySummary, searchInventory } from "@/server/inventory/admin-inventory";
import { hasActiveInventoryFilters, inventorySearchToQuery, parseInventorySearch } from "@/server/inventory/inventory-search";
import { getOrderRepository } from "@/server/orders/session";

export const metadata: Metadata = {
  title: "Inventario · Administración",
  robots: { index: false, follow: false },
};

const LIST = "/admin/inventario";

async function InventoryList({ searchParams }: { searchParams: PageProps<"/admin/inventario">["searchParams"] }) {
  // Always request-time: also keeps the route dynamic where the panel is disabled.
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();

  const search = parseInventorySearch(await searchParams);
  // Expiry does not depend on a scheduled job: due reservations are released
  // before reading, so expired holds are not shown as reserved (same as Pedidos).
  await getOrderRepository().releaseExpired();
  const sql = getSql();
  const [summary, result, categoryList] = await Promise.all([
    inventorySummary(sql),
    searchInventory(sql, search),
    getCategoryRepository().listCategories(),
  ]);
  const categories = categoryList.map((category) => ({
    value: category.id,
    label: category.active ? category.label : `${category.label} (oculta)`,
  }));
  const filtered = hasActiveInventoryFilters(search);
  // The current query, normalized: pagination links keep every filter.
  const query = inventorySearchToQuery(search);

  return (
    <Stack gap={4}>
      <PageHeader
        title="Inventario"
        subtitle="Stock físico, reservado por pedidos pendientes de pago y disponible para vender. Cada variante tiene un único stock (no hay depósitos). Los productos a pedido no llevan stock y no aparecen acá."
        secondaryActions={<Button href={`${LIST}/movimientos`}>Movimientos</Button>}
      />

      <InventorySummaryCards summary={summary} />

      <Card padding="none">
        <div className={styles.list}>
          <InventoryFilters search={search} categories={categories} />

          {result.items.length > 0 ? (
            <InventoryListTable rows={result.items} />
          ) : filtered ? (
            <EmptyState
              heading="No hay variantes con estos filtros"
              action={
                <Button href={LIST} variant="primary">
                  Limpiar filtros
                </Button>
              }
            >
              <p>Probá con otra búsqueda o quitá algún filtro.</p>
            </EmptyState>
          ) : (
            <EmptyState heading="Todavía no hay productos con control de stock">
              <p>Cuando un producto lleve stock (no a pedido), sus variantes aparecen acá.</p>
            </EmptyState>
          )}

          {result.pages > 1 ? (
            <div className={styles.footer}>
              <Pagination
                page={result.page}
                pageSize={result.pageSize}
                total={result.total}
                baseHref={LIST}
                searchParams={Object.fromEntries(new URLSearchParams(query.slice(1)))}
              />
            </div>
          ) : (
            result.total > 0 && (
              <p className={styles.summary} role="status">
                {result.total} {result.total === 1 ? "variante" : "variantes"}
              </p>
            )
          )}
        </div>
      </Card>
    </Stack>
  );
}

export default function AdminInventoryPage({ searchParams }: PageProps<"/admin/inventario">) {
  return (
    <main id="contenido" className={styles.page}>
      <Suspense fallback={<InventoryListSkeleton />}>
        <InventoryList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
