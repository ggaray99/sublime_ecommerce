import { Card, Skeleton, SkeletonBlock, SkeletonText, Stack } from "@/components/admin/ui";
import styles from "./list.module.css";

/** Suspense fallback with the list's shape: header, tabs and filters, then rows. Says nothing about the panel. */
export function ProductListSkeleton() {
  return (
    <Skeleton label="Cargando productos…">
      <Stack gap={4}>
        <SkeletonText lines={1} />
        <Card padding="none">
          <div className={styles.list}>
            <div className={styles.filters}>
              <SkeletonBlock height={36} />
            </div>
            {Array.from({ length: 8 }, (_, row) => (
              <div key={row} className={styles.skeletonRow}>
                <SkeletonBlock height={16} />
                <SkeletonBlock height={40} />
                <SkeletonText lines={2} />
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
