import p from "@/components/admin/products/list.module.css";
import { Card, Skeleton, SkeletonBlock, SkeletonText, Stack } from "@/components/admin/ui";
import s from "./list.module.css";

/** Suspense fallback with the page's shape: header, summary cards, filters, then rows. Says nothing about the stock. */
export function InventoryListSkeleton() {
  return (
    <Skeleton label="Cargando inventario…">
      <Stack gap={4}>
        <SkeletonText lines={2} />
        <div className={s.summaryBox}>
          <div className={s.skeletonStats}>
            {Array.from({ length: 6 }, (_, card) => (
              <SkeletonBlock key={card} height={88} />
            ))}
          </div>
        </div>
        <Card padding="none">
          <div className={p.list}>
            <div className={p.filters}>
              <SkeletonBlock height={36} />
            </div>
            <InventoryRowsSkeleton />
          </div>
        </Card>
      </Stack>
    </Skeleton>
  );
}

/** Rows only: shared with the movements fallback. */
export function InventoryRowsSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }, (_, row) => (
        <div key={row} className={s.skeletonRow}>
          <SkeletonBlock height={40} />
          <SkeletonText lines={2} />
          <SkeletonText lines={1} />
          <SkeletonText lines={1} />
          <SkeletonText lines={1} />
          <SkeletonText lines={1} />
        </div>
      ))}
    </>
  );
}
