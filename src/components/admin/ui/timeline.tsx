import type { ReactNode } from "react";
import type { BadgeTone } from "./badge";
import { cx } from "./class-names.ts";
import styles from "./timeline.module.css";

export type TimelineItem = {
  id: string;
  /** What happened; carries the meaning (the dot colour only repeats it). */
  title: ReactNode;
  /** Details under the title, e.g. a note. */
  description?: ReactNode;
  /** Who did it, shown beside the time. */
  meta?: ReactNode;
  /** A Date, or an ISO date string; rendered in a <time dateTime>. */
  time: Date | string;
  tone?: BadgeTone;
};

export type TimelineProps = {
  /** In display order: the caller decides (newest first for activity). */
  items: readonly TimelineItem[];
  /** Accessible name of the list, e.g. "Historial del pedido". */
  label?: string;
  /** Text of each time; defaults to day and time in Argentina. */
  formatTime?: (date: Date) => string;
  /** Shown when there are no items. */
  empty?: ReactNode;
  className?: string;
};

const DEFAULT_FORMAT = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

/**
 * Vertical activity list (Shopify "Timeline"): a dot and a line per item, the
 * title, an optional description, and who/when. Semantic <ol> with <time>;
 * the dot is decorative, so nothing depends on colour. Server-renderable.
 */
export function Timeline({ items, label, formatTime = (date) => DEFAULT_FORMAT.format(date), empty = "Sin actividad registrada.", className }: TimelineProps) {
  if (!items.length) return <p className={styles.empty}>{empty}</p>;
  return (
    <ol className={cx(styles.timeline, className)} aria-label={label}>
      {items.map((item) => {
        const date = typeof item.time === "string" ? new Date(item.time) : item.time;
        const valid = !Number.isNaN(date.getTime());
        return (
          <li key={item.id} className={cx(styles.item, styles[item.tone ?? "neutral"])}>
            <span className={styles.dot} aria-hidden="true" />
            <div className={styles.content}>
              <p className={styles.title}>{item.title}</p>
              {item.description && <div className={styles.description}>{item.description}</div>}
              <p className={styles.meta}>
                {item.meta && <>{item.meta} · </>}
                <time dateTime={valid ? date.toISOString() : String(item.time)}>{valid ? formatTime(date) : String(item.time)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
