import p from "@/components/admin/products/list.module.css";
import { Card, Skeleton, SkeletonBlock, SkeletonText, Stack } from "@/components/admin/ui";
import s from "./list.module.css";

/** Suspense fallback with the list's shape: header and filters, then rows. Says nothing about the customers. */
export function CustomerListSkeleton() {
  return (
    <Skeleton label="Cargando clientes…">
      <Stack gap={4}>
        <SkeletonText lines={1} />
        <Card padding="none">
          <div className={p.list}>
            <div className={p.filters}>
              <SkeletonBlock height={36} />
            </div>
            {Array.from({ length: 8 }, (_, row) => (
              <div key={row} className={s.skeletonRow}>
                <SkeletonText lines={2} />
                <SkeletonText lines={1} />
                <SkeletonText lines={1} />
                <SkeletonText lines={1} />
                <SkeletonText lines={1} />
              </div>
            ))}
          </div>
        </Card>
      </Stack>
    </Skeleton>
  );
}
