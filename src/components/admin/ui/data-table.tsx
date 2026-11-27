import Link from "next/link";
import { useId, type CSSProperties, type ReactNode } from "react";
import { cx } from "./class-names.ts";
import { SkeletonTableRows } from "./skeleton";
import styles from "./data-table.module.css";
import utilities from "./utilities.module.css";

export type DataTableColumn<Row> = {
  /** Stable key of the column. */
  key: string;
  header: ReactNode;
  /** Hides the header text visually (e.g. a checkbox or actions column). */
  headerHidden?: boolean;
  cell: (row: Row, index: number) => ReactNode;
  align?: "start" | "center" | "end";
  /** CSS width, e.g. "48px" or "20%". */
  width?: string;
  /** Keep the cell on one line. */
  nowrap?: boolean;
  /**
   * The cell that names the row: rendered as <th scope="row"> and, with
   * `rowHref`, as the row's link. Defaults to the first column.
   */
  rowHeader?: boolean;
};

export type DataTableProps<Row> = {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Names the table (caption) and its scroll region. */
  caption: ReactNode;
  captionHidden?: boolean;
  /** Each row links here: the row-header cell gets a link stretched over the whole row. */
  rowHref?: (row: Row) => string | undefined;
  /** Highlights a row (e.g. "critical" for low stock); add a Badge too, never colour alone. */
  rowTone?: (row: Row) => "critical" | "warning" | "subdued" | undefined;
  /** Header stays visible while the table scrolls inside its box (`maxHeight`). */
  stickyHeader?: boolean;
  maxHeight?: string;
  /** Shown in place of the rows when there are none. */
  empty?: ReactNode;
  /** Shows skeleton rows and marks the table busy. */
  loading?: boolean;
  loadingRows?: number;
  loadingLabel?: string;
  className?: string;
};

/**
 * Server-renderable table. Cell renderers are plain functions, so render it
 * from a server component (or a client one): it ships no JavaScript itself.
 * Row selection composes with <SelectableTable> (see the docs).
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  captionHidden,
  rowHref,
  rowTone,
  stickyHeader,
  maxHeight = "70vh",
  empty,
  loading,
  loadingRows = 5,
  loadingLabel = "Cargando…",
  className,
}: DataTableProps<Row>) {
  const captionId = useId();
  const headerIndex = Math.max(
    0,
    columns.findIndex((column) => column.rowHeader),
  );
  const alignClass = (align: DataTableColumn<Row>["align"]) => (align === "end" ? styles.alignEnd : align === "center" ? styles.alignCenter : undefined);

  return (
    <div
      className={cx(styles.wrap, stickyHeader && styles.sticky, className)}
      style={stickyHeader ? ({ "--table-max-height": maxHeight } as CSSProperties) : undefined}
      // A scrollable box must be reachable and named for keyboard users.
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
    >
      {loading && (
        <span role="status" className={utilities.visuallyHidden}>
          {loadingLabel}
        </span>
      )}
      <table className={styles.table} aria-busy={loading || undefined}>
        <caption id={captionId} className={cx(styles.caption, captionHidden && utilities.visuallyHidden)}>
          {caption}
        </caption>
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={column.width ? { width: column.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cx(styles.th, alignClass(column.align))}>
                {column.headerHidden ? <span className={utilities.visuallyHidden}>{column.header}</span> : column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonTableRows rows={loadingRows} columns={columns.length} />
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.emptyCell}>
                {empty ?? <p className={styles.emptyText}>No hay registros para mostrar.</p>}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => {
              const href = rowHref?.(row);
              const tone = rowTone?.(row);
              return (
                <tr key={rowKey(row)} className={cx(styles.row, href && styles.linked, tone && styles[tone])}>
                  {columns.map((column, columnIndex) => {
                    const content = column.cell(row, index);
                    const cellClass = cx(styles.td, alignClass(column.align), column.nowrap && styles.nowrap);
                    if (columnIndex !== headerIndex) {
                      return (
                        <td key={column.key} className={cellClass}>
                          {content}
                        </td>
                      );
                    }
                    return (
                      <th key={column.key} scope="row" className={cx(cellClass, styles.rowHeader)}>
                        {href ? (
                          <Link href={href} className={styles.rowLink}>
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </th>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
