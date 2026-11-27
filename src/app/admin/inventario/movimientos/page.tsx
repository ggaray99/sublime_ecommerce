import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { MovementFilters } from "@/components/admin/inventory/movements-filters";
import { MovementsSkeleton } from "@/components/admin/inventory/movements-skeleton";
import { MovementsTable, ORDER_NOTE_ID } from "@/components/admin/inventory/movements-table";
import inventoryStyles from "@/components/admin/inventory/list.module.css";
import styles from "@/components/admin/products/list.module.css";
import { AdminUnavailable } from "@/components/admin/shared";
import { Breadcrumbs, Button, Card, EmptyState, PageHeader, Pagination, Stack } from "@/components/admin/ui";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { getSql } from "@/server/db/client";
import { hasActiveMovementFilters, movementSearchToQuery, parseMovementSearch } from "@/server/inventory/inventory-search";
import { listInventoryMovements } from "@/server/inventory/movements";
import { getOrderRepository } from "@/server/orders/session";

export const metadata: Metadata = {
  title: "Movimientos de stock · Administración",
  robots: { index: false, follow: false },
};

const LIST = "/admin/inventario/movimientos";

async function MovementList({ searchParams }: { searchParams: PageProps<"/admin/inventario/movimientos">["searchParams"] }) {
  // Always request-time: also keeps the route dynamic where the panel is disabled.
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();

  const search = parseMovementSearch(await searchParams);
  // Due reservations are released first (no scheduled job), so their "Reserva vencida" rows are listed.
  await getOrderRepository().releaseExpired();
  const result = await listInventoryMovements(getSql(), {
    q: search.query || undefined,
    kind: search.kind,
    desde: search.from,
    hasta: search.to,
    page: search.page,
  });
  const filtered = hasActiveMovementFilters(search);
  // The current query, normalized: pagination links keep every filter.
  const query = movementSearchToQuery(search);

  return (
    <Stack gap={4}>
      <PageHeader
        title="Movimientos de stock"
        subtitle="Entradas, ventas, ajustes y reservas de cada variante, del más reciente al más antiguo. Fechas en hora de Argentina."
        breadcrumbs={<Breadcrumbs items={[{ label: "Inventario", href: "/admin/inventario" }, { label: "Movimientos" }]} />}
      />

      <Card padding="none">
        <div className={styles.list}>
          <MovementFilters search={search} />

          {result.items.length > 0 ? (
            <>
              <MovementsTable movements={result.items} />
              <p id={ORDER_NOTE_ID} className={inventoryStyles.footNote}>
                Pedido: el pedido que reservó o compró las unidades. Las ventas de pagos que llegaron después de vencer la reserva no
                tienen pedido asociado y muestran «—».
              </p>
            </>
          ) : filtered ? (
            <EmptyState
              heading="No hay movimientos con estos filtros"
              action={
                <Button href={LIST} variant="primary">
                  Limpiar filtros
                </Button>
              }
            >
              <p>Probá con otra búsqueda, otras fechas o quitá algún filtro.</p>
            </EmptyState>
          ) : (
            <EmptyState heading="Todavía no hay movimientos de stock">
              <p>Las cargas, ventas, ajustes y reservas aparecen acá a medida que ocurren.</p>
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
                {result.total} {result.total === 1 ? "movimiento" : "movimientos"}
              </p>
            )
          )}
        </div>
      </Card>
    </Stack>
  );
}

export default function AdminInventoryMovementsPage({ searchParams }: PageProps<"/admin/inventario/movimientos">) {
  return (
    <main id="contenido" className={styles.page}>
      <Suspense fallback={<MovementsSkeleton />}>
        <MovementList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
