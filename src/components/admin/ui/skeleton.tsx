import type { ReactNode } from "react";
import { cx } from "./class-names.ts";
import styles from "./skeleton.module.css";
import utilities from "./utilities.module.css";

/**
 * Loading placeholder. The shapes are aria-hidden; the container announces
 * `label` once (role="status") so screen readers know something is loading.
 */
export function Skeleton({ label = "Cargando…", children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" className={cx(styles.container, className)}>
      <span className={utilities.visuallyHidden}>{label}</span>
      <div aria-hidden="true" className={styles.shapes}>
        {children}
      </div>
    </div>
  );
}

/** Text lines; the last one is shorter. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className={styles.text}>
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className={cx(styles.shape, styles.line, index === lines - 1 && lines > 1 && styles.lineShort)} />
      ))}
    </div>
  );
}

/** A block (image, chart, card body). */
export function SkeletonBlock({ height = 96 }: { height?: number }) {
  return <span className={cx(styles.shape, styles.block)} style={{ height }} />;
}

/** Table rows for a DataTable tbody (aria-hidden: the table carries the status). */
export function SkeletonTableRows({ rows = 5, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} aria-hidden="true">
          {Array.from({ length: columns }, (_, column) => (
            <td key={column} className={styles.cell}>
              <span className={cx(styles.shape, styles.line, column === 0 && styles.lineShort)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
