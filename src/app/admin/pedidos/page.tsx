import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BulkOrderActions } from "@/components/admin/orders/bulk-order-actions";
import { OrderFilters, OrderStatusFilter, OrderTabs } from "@/components/admin/orders/list-filters";
import { OrderListSkeleton } from "@/components/admin/orders/list-skeleton";
import { OrderListTable } from "@/components/admin/orders/list-table";
import orderStyles from "@/components/admin/orders/list.module.css";
import styles from "@/components/admin/products/list.module.css";
import { SelectableTable } from "@/components/admin/selectable-table";
import { ExportSelectedButton, SelectionBar } from "@/components/admin/selection-bar";
import { AdminUnavailable } from "@/components/admin/shared";
import { Button, Card, EmptyState, PageHeader, Pagination, Stack } from "@/components/admin/ui";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { hasActiveOrderFilters, orderSearchToQuery, parseOrderSearch } from "@/server/orders/order-search";
import { getOrderRepository } from "@/server/orders/session";

export const metadata: Metadata = {
  title: "Pedidos · Administración",
  robots: { index: false, follow: false },
};

const LIST = "/admin/pedidos";

async function OrderList({ searchParams }: { searchParams: PageProps<"/admin/pedidos">["searchParams"] }) {
  // Always request-time: also keeps the route dynamic where the panel is disabled.
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();

  const search = parseOrderSearch(await searchParams);
  const repo = getOrderRepository();
  // Expiry does not depend on a scheduled job: due reservations are released here too.
  const released = await repo.releaseExpired();
  const [result, byStatus, toDeliver] = await Promise.all([repo.searchOrders(search), repo.countByStatus(), repo.countToDeliver()]);
  const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
  const filtered = hasActiveOrderFilters(search);
  // The current query, normalized: pagination links keep every filter.
  const query = orderSearchToQuery(search);

  return (
    <Stack gap={4}>
      <PageHeader title="Pedidos" subtitle="Los pagos con Mercado Pago se confirman solos. Las transferencias se confirman en cada pedido." />

      {released.orders > 0 && (
        <p className={orderStyles.notice} role="status">
          {released.orders === 1 ? "Venció 1 pedido" : `Vencieron ${released.orders} pedidos`} sin pago: su stock se liberó.
        </p>
      )}

      <Card padding="none">
        <div className={styles.list}>
          <OrderTabs search={search} counts={{ total, byStatus, toDeliver }} />
          <OrderFilters search={search} />
          <OrderStatusFilter search={search} />

          {result.items.length > 0 ? (
            // A new page, filter or order starts with nothing selected (key).
            <SelectableTable key={query} ids={result.items.map((order) => order.id)}>
              <div className={styles.selection}>
                <SelectionBar
                  idleHint="Seleccioná pedidos para exportarlos o cambiarlos en bloque"
                  hint={result.pages > 1 ? "La selección vale para los pedidos de esta página." : undefined}
                >
                  <BulkOrderActions />
                  <ExportSelectedButton endpoint={`${LIST}/exportar`} />
                </SelectionBar>
              </div>
              <OrderListTable orders={result.items} />
            </SelectableTable>
          ) : filtered ? (
            <EmptyState
              heading="No hay pedidos con estos filtros"
              action={
                <Button href={LIST} variant="primary">
                  Limpiar filtros
                </Button>
              }
            >
              <p>Probá con otra búsqueda, otras fechas o quitá algún filtro.</p>
            </EmptyState>
          ) : (
            <EmptyState heading="Todavía no hay pedidos">
              <p>Cuando alguien compre en la tienda, el pedido aparece acá.</p>
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
                {result.total} {result.total === 1 ? "pedido" : "pedidos"}
              </p>
            )
          )}
        </div>
      </Card>
    </Stack>
  );
}

export default function AdminOrdersPage({ searchParams }: PageProps<"/admin/pedidos">) {
  return (
    <main id="contenido" className={styles.page}>
      <Suspense fallback={<OrderListSkeleton />}>
        <OrderList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
