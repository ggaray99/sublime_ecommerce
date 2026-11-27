import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { MovementRows } from "@/components/admin/inventory/detail-movements";
import { AvailabilityCard, ReservationsCard } from "@/components/admin/inventory/detail-side";
import { VariantsCard } from "@/components/admin/inventory/detail-variants";
import styles from "@/components/admin/inventory/detail.module.css";
import { STATUS_BADGE } from "@/components/admin/products/product-page-helpers";
import { AdminUnavailable } from "@/components/admin/shared";
import { Badge, Breadcrumbs, Button, Card, PageHeader, Pagination, Skeleton, SkeletonBlock, SkeletonText, Stack } from "@/components/admin/ui";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { MAX_STOCK } from "@/server/admin/validation";
import { getSql } from "@/server/db/client";
import { activeReservations, inventoryDetail } from "@/server/inventory/admin-detail";
import { listInventoryMovements } from "@/server/inventory/movements";
import { getOrderRepository } from "@/server/orders/session";

export const metadata: Metadata = {
  title: "Inventario · Administración",
  robots: { index: false, follow: false },
};

const MOVEMENTS_PER_PAGE = 20;

type Props = PageProps<"/admin/inventario/[productId]">;

async function InventoryAdmin({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  // Always request-time: also keeps the route dynamic where the panel is disabled.
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();

  const [{ productId }, query] = await Promise.all([params, searchParams]);
  const sql = getSql();
  // Expired reservations go back to stock before reading, like Pedidos.
  await getOrderRepository().releaseExpired();
  const detail = await inventoryDetail(sql, productId);
  if (!detail) notFound();

  const requestedPage = Number(typeof query.pagina === "string" ? query.pagina : 1);
  const [reservations, movements] = await Promise.all([
    activeReservations(sql, productId),
    listInventoryMovements(sql, { productId, page: requestedPage, pageSize: MOVEMENTS_PER_PAGE }),
  ]);
  const status = STATUS_BADGE[detail.status];
  const movementsHref = `/admin/inventario/movimientos?q=${encodeURIComponent(detail.defaultSku)}`;

  return (
    <Stack gap={4}>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Inventario", href: "/admin/inventario" }, { label: detail.name }]} />}
        back={{ href: "/admin/inventario", label: "Volver a Inventario" }}
        title={detail.name}
        subtitle={`SKU ${detail.defaultSku}`}
        meta={
          <>
            <Badge tone={status.tone}>{status.label}</Badge>
            {!detail.trackStock && <Badge tone="neutral">A pedido</Badge>}
          </>
        }
        secondaryActions={
          <>
            <Button href={`/admin/productos/${detail.id}`}>Editar producto</Button>
            <Button href={movementsHref}>Ver movimientos</Button>
          </>
        }
      />

      <div className={styles.layout}>
        <div className={styles.main}>
          <VariantsCard detail={detail} maxStock={MAX_STOCK} />
          <Card section id="movimientos" title="Movimientos" actions={<Button href={movementsHref} size="sm" variant="tertiary">Ver todos</Button>}>
            <Stack gap={3}>
              <MovementRows movements={movements.items} optionNames={detail.optionNames} empty="Este producto todavía no tiene movimientos de stock." />
              {movements.pages > 1 && (
                <Pagination
                  page={movements.page}
                  pageSize={movements.pageSize}
                  total={movements.total}
                  baseHref={`/admin/inventario/${detail.id}`}
                  searchParams={query}
                />
              )}
            </Stack>
          </Card>
        </div>

        <div className={styles.side}>
          <ReservationsCard reservations={reservations} optionNames={detail.optionNames} />
          <AvailabilityCard detail={detail} />
        </div>
      </div>
    </Stack>
  );
}

function InventorySkeleton() {
  return (
    <Skeleton label="Cargando el inventario del producto…">
      <Stack gap={4}>
        <SkeletonText lines={2} />
        <div className={styles.layout}>
          <div className={styles.main}>
            <SkeletonBlock height={240} />
            <SkeletonBlock height={320} />
          </div>
          <div className={styles.side}>
            <SkeletonBlock height={160} />
            <SkeletonBlock height={180} />
          </div>
        </div>
      </Stack>
    </Skeleton>
  );
}

export default function AdminInventoryProductPage({ params, searchParams }: Props) {
  return (
    <main id="contenido" className={styles.page}>
      <Suspense fallback={<InventorySkeleton />}>
        <InventoryAdmin params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
