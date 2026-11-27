import p from "@/components/admin/products/list.module.css";
import { Card, Skeleton, SkeletonBlock, SkeletonText, Stack } from "@/components/admin/ui";
import { InventoryRowsSkeleton } from "./list-skeleton";

/** Suspense fallback for the movements page: header, filters, then rows. Says nothing about the movements. */
export function MovementsSkeleton() {
  return (
    <Skeleton label="Cargando movimientos…">
      <Stack gap={4}>
        <SkeletonText lines={2} />
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
